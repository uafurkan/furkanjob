// Metinde e-posta yoksa web'de arar:
// 1) Metindeki URL'lerin sayfalarını (ve /contact) tarar, mailto/e-posta toplar
// 2) Bulamazsa DuckDuckGo HTML üzerinden şirket adıyla arar
// Harici API anahtarı gerektirmez. (Node 18+ global fetch kullanır.)

const { extractEmails } = require("./detect");

const UA = "Mozilla/5.0 (compatible; JobApplyBot/1.0)";
const TIMEOUT = 12000;

async function fetchText(url) {
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

function origin(url) {
  try {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function scrapeEmailsFromUrls(urls) {
  const candidates = new Set();
  for (const u of urls.slice(0, 5)) {
    const o = origin(u);
    if (!o) continue;
    candidates.add(u);
    candidates.add(o);
    candidates.add(o + "/contact");
    candidates.add(o + "/contact-us");
    candidates.add(o + "/contacts");
  }
  const found = new Set();
  for (const url of [...candidates].slice(0, 10)) {
    const html = await fetchText(url);
    if (!html) continue;
    extractEmails(html).forEach((e) => found.add(e));
    if (found.size >= 3) break;
  }
  return [...found];
}

async function duckduckgo(query) {
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  if (!html) return [];
  // Sonuç linklerinden alan adlarını çek
  const links = [...html.matchAll(/uddg=([^&"]+)/g)]
    .map((m) => {
      try { return decodeURIComponent(m[1]); } catch { return null; }
    })
    .filter(Boolean);
  return [...new Set(links)].slice(0, 5);
}

// Ana fonksiyon: önce URL'leri tara, sonra arama motoru
async function findEmails({ urls = [], company = "", country = "" }) {
  let emails = await scrapeEmailsFromUrls(urls);
  if (emails.length) return { emails, source: "page-scrape" };

  const queries = [
    `${company} ${country} contact email`,
    `${company} careers email`,
  ];
  for (const q of queries) {
    const resultUrls = await duckduckgo(q);
    emails = await scrapeEmailsFromUrls(resultUrls);
    if (emails.length) return { emails, source: "web-search" };
  }
  return { emails: [], source: "none" };
}

module.exports = { findEmails, scrapeEmailsFromUrls };
