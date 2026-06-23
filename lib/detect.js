// Metinden e-posta, ülke, pozisyon ve şirket adını algılayan akıllı modül.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /\bhttps?:\/\/[^\s)"'<>]+|\b(?:www\.)[^\s)"'<>]+|\b[a-z0-9.\-]+\.(?:com|org|net|co\.nz|co\.uk|com\.au|nz|au|us|io|info)\b[^\s)"'<>]*/gi;

// E-posta gibi görünen ama spam/placeholder olanları ele
const BAD_EMAIL = /(example\.com|sentry\.io|wixpress|@2x|\.png|\.jpg|\.svg|\.gif|domain\.com|email\.com|yourname)/i;

function extractEmails(text) {
  const found = (text.match(EMAIL_RE) || [])
    .map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, ""))
    .filter((e) => !BAD_EMAIL.test(e));
  return [...new Set(found)];
}

function extractUrls(text) {
  const found = (text.match(URL_RE) || [])
    .map((u) => u.trim().replace(/[.,;:)]+$/, ""))
    .filter((u) => !/\.(png|jpg|jpeg|svg|gif|webp|css|js)$/i.test(u));
  return [...new Set(found)];
}

// Ülke tespiti: anahtar kelime + alan adı uzantısı + para birimi/şehir ipuçları
const COUNTRY_RULES = [
  {
    code: "NZ",
    name: "New Zealand",
    visa: "Accredited Employer Work Visa (AEWV) sponsorship",
    test: /\b(new zealand|nz\b|auckland|wellington|christchurch|queenstown|kiwi|\.co\.nz|\.nz\b|nzd)\b/i,
  },
  {
    code: "AU",
    name: "Australia",
    visa: "TSS / Skilled Work visa (employer sponsorship)",
    test: /\b(australia|australian|sydney|melbourne|brisbane|perth|adelaide|\.com\.au|\.au\b|aud)\b/i,
  },
  {
    code: "US",
    name: "United States",
    visa: "H-2B / work visa sponsorship",
    test: /\b(united states|u\.s\.a|\busa\b|\bus\b|new york|los angeles|miami|chicago|texas|california|florida|usd|\$\d)\b/i,
  },
  {
    code: "CA",
    name: "Canada",
    visa: "LMIA-based work permit sponsorship",
    test: /\b(canada|canadian|toronto|vancouver|montreal|\.ca\b|cad)\b/i,
  },
  {
    code: "UK",
    name: "United Kingdom",
    visa: "Skilled Worker visa (employer sponsorship)",
    test: /\b(united kingdom|england|scotland|london|manchester|\.co\.uk|\bgbp\b|£)\b/i,
  },
];

function detectCountry(text) {
  for (const r of COUNTRY_RULES) {
    if (r.test.test(text)) return r;
  }
  return { code: "XX", name: "the country", visa: "work visa sponsorship", test: null };
}

// Pozisyon tespiti
const POSITION_RULES = [
  { test: /\bfront desk|receptionist|front office\b/i, label: "Front Desk / Reception" },
  { test: /\bkitchen|chef|cook|kitchen hand|commis\b/i, label: "Kitchen" },
  { test: /\bwait(er|ress)|server|serving|food service|f&b\b/i, label: "Food & Beverage Service" },
  { test: /\bhousekeep|room attendant|cleaner\b/i, label: "Housekeeping" },
  { test: /\bbarista|cafe\b/i, label: "Barista" },
  { test: /\bbartender|bar staff\b/i, label: "Bar" },
  { test: /\bconcierge\b/i, label: "Concierge" },
];

function detectPositions(text) {
  const hits = POSITION_RULES.filter((p) => p.test.test(text)).map((p) => p.label);
  return hits.length ? [...new Set(hits)] : ["Hospitality"];
}

// Şirket adı tahmini: e-posta domaininden veya ilk anlamlı satırdan
function guessCompany(text, emails) {
  if (emails && emails.length) {
    const domain = emails[0].split("@")[1] || "";
    const core = domain.split(".")[0];
    if (core && !/gmail|outlook|hotmail|yahoo|icloud|proton/i.test(core)) {
      return core
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  const firstLine = (text.split("\n").map((l) => l.trim()).find((l) => l.length > 3 && l.length < 80)) || "";
  return firstLine || "your company";
}

function analyze(text) {
  const emails = extractEmails(text);
  const urls = extractUrls(text);
  const country = detectCountry(text);
  const positions = detectPositions(text);
  const company = guessCompany(text, emails);
  return { emails, urls, country, positions, company };
}

module.exports = { analyze, extractEmails, extractUrls, detectCountry, detectPositions, guessCompany };
