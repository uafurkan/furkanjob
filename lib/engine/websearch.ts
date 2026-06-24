// Find a business's REAL published email when the pasted text has none.
// 1) scrape the URLs in the text (+ their /contact pages)
// 2) fall back to a DuckDuckGo HTML search by company/country
// Never fabricates an address — only extracts ones that actually appear on a page.
import { extractEmails } from "./detect";

const UA = "Mozilla/5.0 (compatible; ApplyThatForMeBot/1.0; +https://applythatforme.com)";
const TIMEOUT = 12000;

async function fetchText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function origin(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function scrapeEmailsFromUrls(urls: string[]): Promise<string[]> {
  const candidates = new Set<string>();
  for (const u of urls.slice(0, 5)) {
    const o = origin(u);
    if (!o) continue;
    candidates.add(u);
    candidates.add(o);
    candidates.add(o + "/contact");
    candidates.add(o + "/contact-us");
    candidates.add(o + "/contacts");
  }
  const found = new Set<string>();
  for (const url of [...candidates].slice(0, 10)) {
    const html = await fetchText(url);
    if (!html) continue;
    extractEmails(html).forEach((e) => found.add(e));
    if (found.size >= 3) break;
  }
  return [...found];
}

async function duckduckgo(query: string): Promise<string[]> {
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  if (!html) return [];
  const links = [...html.matchAll(/uddg=([^&"]+)/g)]
    .map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return null;
      }
    })
    .filter((x): x is string => Boolean(x));
  return [...new Set(links)].slice(0, 5);
}

export type FindResult = { emails: string[]; source: "page-scrape" | "web-search" | "none" };

export async function findEmails(opts: { urls?: string[]; company?: string; country?: string }): Promise<FindResult> {
  const { urls = [], company = "", country = "" } = opts;
  let emails = await scrapeEmailsFromUrls(urls);
  if (emails.length) return { emails, source: "page-scrape" };

  const queries = [`${company} ${country} contact email`, `${company} careers email`];
  for (const q of queries) {
    const resultUrls = await duckduckgo(q);
    emails = await scrapeEmailsFromUrls(resultUrls);
    if (emails.length) return { emails, source: "web-search" };
  }
  return { emails: [], source: "none" };
}
