// Extract emails/URLs and detect country, positions and company from pasted business text.
import type { CountryRule } from "./rules";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const URL_RE =
  /\bhttps?:\/\/[^\s)"'<>]+|\b(?:www\.)[^\s)"'<>]+|\b[a-z0-9.\-]+\.(?:com|org|net|co\.nz|co\.uk|com\.au|nz|au|us|io|info)\b[^\s)"'<>]*/gi;

const BAD_EMAIL =
  /(example\.com|sentry\.io|wixpress|@2x|\.png|\.jpg|\.svg|\.gif|domain\.com|email\.com|yourname)/i;

export function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) || [])
    .map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, ""))
    .filter((e) => !BAD_EMAIL.test(e));
  return [...new Set(found)];
}

export function extractUrls(text: string): string[] {
  const found = (text.match(URL_RE) || [])
    .map((u) => u.trim().replace(/[.,;:)]+$/, ""))
    .filter((u) => !/\.(png|jpg|jpeg|svg|gif|webp|css|js)$/i.test(u));
  return [...new Set(found)];
}

const COUNTRY_RULES: (CountryRule & { test: RegExp })[] = [
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
    test: /\b(united states|u\.s\.a|\busa\b|new york|los angeles|miami|chicago|texas|california|florida|usd)\b/i,
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

export function detectCountry(text: string): CountryRule {
  for (const r of COUNTRY_RULES) if (r.test.test(text)) return { code: r.code, name: r.name, visa: r.visa };
  return { code: "XX", name: "the destination country", visa: "work visa sponsorship" };
}

const POSITION_RULES: { test: RegExp; label: string }[] = [
  { test: /\bfront desk|receptionist|front office\b/i, label: "Front Desk" },
  { test: /\bkitchen|chef|cook|kitchen hand|commis\b/i, label: "Kitchen" },
  { test: /\bwait(er|ress)|server|serving|food service|f&b\b/i, label: "Food & Beverage Service" },
  { test: /\bhousekeep|room attendant|cleaner\b/i, label: "Housekeeping" },
  { test: /\bbarista|cafe\b/i, label: "Barista" },
  { test: /\bbartender|bar staff\b/i, label: "Bar" },
  { test: /\bconcierge\b/i, label: "Concierge" },
];

export function detectPositions(text: string): string[] {
  const hits = POSITION_RULES.filter((p) => p.test.test(text)).map((p) => p.label);
  return hits.length ? [...new Set(hits)] : [];
}

export function guessCompany(text: string, emails: string[]): string {
  // Prefer a content line that names a venue type.
  const venueLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /\b(hotel|suites|resort|restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie)\b/i.test(l) && l.length < 80);
  if (venueLine) return venueLine.replace(/\s+[-–—|].*$/, "").trim();

  if (emails.length) {
    const domain = emails[0].split("@")[1] || "";
    const core = domain.split(".")[0];
    if (core && !/gmail|outlook|hotmail|yahoo|icloud|proton/i.test(core)) {
      return core.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3 && l.length < 80);
  return firstLine || "your company";
}

// Lightweight language detection of the pasted business text (for "auto" application language).
// Scores common function words + diacritics per language; returns null when unsure.
const LANG_HINTS: { code: string; re: RegExp }[] = [
  { code: "es", re: /\b(el|la|los|las|de|y|para|con|trabajo|empresa|hotel|restaurante|gracias|nuestro|empleo)\b|[ñ¿¡]/gi },
  { code: "fr", re: /\b(le|la|les|des|et|pour|avec|nous|votre|travail|emploi|hôtel|restaurant|merci|équipe)\b|[àâçéèêëîïôûœ]/gi },
  { code: "de", re: /\b(und|der|die|das|für|mit|wir|unser|arbeit|stelle|bewerbung|gäste|küche|mitarbeiter)\b|[äöüß]/gi },
  { code: "it", re: /\b(il|lo|la|gli|le|di|e|per|con|noi|lavoro|nostro|albergo|ristorante|grazie|cucina)\b/gi },
  { code: "pt", re: /\b(o|a|os|as|de|e|para|com|nós|nosso|trabalho|emprego|hotel|restaurante|obrigado|equipa|cozinha)\b|[ãõç]/gi },
  { code: "tr", re: /\b(ve|için|ile|bir|iş|başvuru|otel|restoran|mutfak|ekip|çalış|departman|misafir)\b|[şğıİ]/gi },
];

export function detectTextLang(text: string): string | null {
  const sample = text.slice(0, 2000);
  let best: { code: string; n: number } | null = null;
  for (const h of LANG_HINTS) {
    const n = (sample.match(h.re) || []).length;
    if (n >= 4 && (!best || n > best.n)) best = { code: h.code, n };
  }
  return best?.code || null;
}

export type Analysis = {
  emails: string[];
  urls: string[];
  country: CountryRule;
  positions: string[];
  company: string;
};

export function analyze(text: string): Analysis {
  const emails = extractEmails(text);
  return {
    emails,
    urls: extractUrls(text),
    country: detectCountry(text),
    positions: detectPositions(text),
    company: guessCompany(text, emails),
  };
}
