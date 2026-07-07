// Find a business's REAL published email when the pasted text has none.
// 1) scrape the URLs in the text (+ many contact/careers/about page variants)
// 2) try to guess the domain from company name + country TLD
// 3) fall back to a DuckDuckGo HTML search enriched with location + phone
// Never fabricates an address — only extracts ones that actually appear on a page.
import { extractEmails } from "./detect";

const UA = "Mozilla/5.0 (compatible; PaplyBot/1.0; +https://paply.me)";
const TIMEOUT = 12000;

// Contact-related page suffixes to probe in priority order.
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contacts",
  "/about",
  "/about-us",
  "/careers",
  "/jobs",
  "/work-with-us",
  "/employment",
  "/hiring",
  "/join-us",
  "/get-in-touch",
  "/team",
];

async function fetchText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow", cache: "no-store" });
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

// Fetch a page and return readable text (tags/script/style stripped). Used when the user
// pastes just a URL instead of the business text — we pull the page so the engine has content.
export async function fetchPageText(url: string): Promise<string> {
  const html = await fetchText(url);
  if (!html) return "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return text.slice(0, 8000);
}

// Scrape a list of URLs + their most-likely contact/careers subpages.
// Returns all real email addresses found (up to 3 to keep latency low).
export async function scrapeEmailsFromUrls(urls: string[]): Promise<string[]> {
  const candidates = new Set<string>();
  for (const u of urls.slice(0, 5)) {
    const o = origin(u);
    if (!o) continue;
    candidates.add(u);
    candidates.add(o);
    for (const path of CONTACT_PATHS) candidates.add(o + path);
  }
  const found = new Set<string>();
  for (const url of [...candidates].slice(0, 18)) {
    const html = await fetchText(url);
    if (!html) continue;
    extractEmails(html).forEach((e) => found.add(e));
    if (found.size >= 3) break;
  }
  return [...found];
}

// Country code → most common TLD(s). Used for domain guessing when the text has no URL.
const COUNTRY_TLDS: Record<string, string[]> = {
  NZ: [".co.nz", ".nz"],
  AU: [".com.au", ".au"],
  UK: [".co.uk", ".uk"],
  US: [".com"],
  CA: [".ca", ".com"],
  IE: [".ie", ".com"],
  DE: [".de", ".com"],
  FR: [".fr", ".com"],
  ES: [".es", ".com"],
  IT: [".it", ".com"],
  NL: [".nl", ".com"],
  PT: [".pt", ".com"],
  AT: [".at", ".com"],
  CH: [".ch", ".com"],
  BE: [".be", ".com"],
  SE: [".se", ".com"],
  DK: [".dk", ".com"],
  NO: [".no", ".com"],
  FI: [".fi", ".com"],
  GR: [".gr", ".com"],
  PL: [".pl", ".com"],
  CZ: [".cz", ".com"],
};

// Normalise accented/special chars to ASCII for domain slugs.
function toAsciiSlug(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// Generic words to drop from a company name before turning it into a domain guess. Covers
// hospitality plus every other industry (clinics, farms, universities, trades...) so domain
// guessing works as well for "Bright Smile Dental Care" as it does for "Aurelia Bay Hotel".
const DOMAIN_STOPWORDS =
  /\b(hotel|suites|resort|hostel|motel|restaurant|cafe|bistro|lodge|inn|bar|grill|brasserie|kitchen|dining|eatery|tavern|pub|clinic|dental|hospital|pharmacy|surgery|medical|health|healthcare|care|farm|orchard|vineyard|winery|dairy|university|college|academy|school|institute|engineering|construction|builders|logistics|transport|garage|motors|automotive|salon|studio|spa|group|limited|ltd|pty|inc|the|a|an|and|of|at|&)\b/g;

// Build candidate domain roots from company name + country TLDs.
// "Aurelia Bay Hotel" + NZ → ["aureliabay.co.nz", "aurelia-bay.co.nz", "aureliabay.com", ...]
function guessDomainsFromCompany(company: string, countryCode: string): string[] {
  const tlds = COUNTRY_TLDS[countryCode] || [".com"];
  const slug = toAsciiSlug(company)
    .replace(DOMAIN_STOPWORDS, " ")
    .replace(/\s+/g, " ").trim();
  if (!slug) return [];
  const words = slug.split(/\s+/).filter((w) => w.length >= 3); // skip short/noise words
  if (!words.length) return [];
  const joined = words.join("");
  const hyphenated = words.join("-");
  const firstWord = words[0];
  const domains: string[] = [];
  for (const tld of tlds) {
    if (joined) domains.push(joined + tld);
    if (hyphenated !== joined) domains.push(hyphenated + tld);
    if (firstWord && firstWord !== joined) domains.push(firstWord + tld);
  }
  if (!tlds.includes(".com")) {
    if (joined) domains.push(joined + ".com");
    if (hyphenated !== joined) domains.push(hyphenated + ".com");
  }
  return [...new Set(domains)].slice(0, 6);
}

async function duckduckgo(query: string): Promise<string[]> {
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  if (!html) return [];
  const links = [...html.matchAll(/uddg=([^&"]+)/g)]
    .map((m) => {
      try { return decodeURIComponent(m[1]); }
      catch { return null; }
    })
    .filter((x): x is string => Boolean(x));
  return [...new Set(links)].slice(0, 5);
}

export type FindResult = {
  emails: string[];
  source: "page-scrape" | "web-search" | "none";
  // Distinct site origins the engine actually probed — used to offer one-click
  // recovery links (homepage / contact / careers) when nothing was found.
  checkedOrigins: string[];
};

// A DuckDuckGo hit for a private business can land on an unrelated official/government page
// (a district council's tourism/accommodation listing, a chamber of commerce directory…) that
// happens to rank for the query — and that page's own general contact email gets scraped as if
// it belonged to the business. Reject institutional domains from generic web-search results
// unless the business genuinely IS a government body (isGovernmentOrg).
function isInstitutionalDomain(email: string): boolean {
  const domain = (email.split("@")[1] || "").toLowerCase();
  return /(^|\.)(gov|govt|mil)(\.|$)/.test(domain) || /(^|\.)council(\.|$)/.test(domain);
}

export async function findEmails(opts: {
  urls?: string[];
  company?: string;
  country?: string;
  countryCode?: string;
  locality?: string;
  address?: string;
  phone?: string;
  isGovernmentOrg?: boolean;
}): Promise<FindResult> {
  const { urls = [], company = "", country = "", countryCode = "", locality = "", address = "", phone = "", isGovernmentOrg = false } = opts;
  const checked = new Set<string>(); // origins we touched, for recovery links
  const remember = (list: string[]) => { for (const u of list) { const o = origin(u); if (o) checked.add(o); } };

  // Step 1: scrape URLs in the text (+ all contact/careers/about subpages).
  remember(urls);
  let emails = await scrapeEmailsFromUrls(urls);
  if (emails.length) return { emails, source: "page-scrape", checkedOrigins: [...checked] };

  // Step 2: if no URL found in the text, try to guess the domain from company + country TLD.
  if (!urls.length && company && countryCode) {
    const guessedDomains = guessDomainsFromCompany(company, countryCode);
    remember(guessedDomains);
    emails = await scrapeEmailsFromUrls(guessedDomains);
    if (emails.length) return { emails, source: "page-scrape", checkedOrigins: [...checked] };
  }

  // Step 3: web search — enriched with location + phone so a generic company name is pinned
  //         down to the exact business. Most specific queries first; stop at the first hit.
  const co = company.trim();
  const loc = locality.trim();
  const addr = address.trim();
  const ph = phone.trim();
  const queries = [
    addr && co    && `"${co}" "${addr}" email`,
    ph && co      && `"${co}" ${ph} email`,
    loc && co     && `${co} ${loc} contact email`,
    loc && co && country && `${co} ${loc} ${country} email`,
    co && country && `${co} ${country} contact email`,
    co            && `${co} careers email`,
    loc && co     && `${co} ${loc} official website`,
  ].filter((q): q is string => Boolean(q));

  const seen = new Set<string>();
  const ordered = queries.filter((q) => !seen.has(q) && seen.add(q) as unknown as boolean).slice(0, 5);

  for (const q of ordered) {
    const resultUrls = await duckduckgo(q);
    remember(resultUrls);
    emails = await scrapeEmailsFromUrls(resultUrls);
    if (!isGovernmentOrg) emails = emails.filter((e) => !isInstitutionalDomain(e));
    if (emails.length) return { emails, source: "web-search", checkedOrigins: [...checked] };
  }
  return { emails: [], source: "none", checkedOrigins: [...checked] };
}
