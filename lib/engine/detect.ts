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

// Score an email address by how well it suits a job application.
// Higher = better. Used to pick the single best recipient from a list.
const JOB_PRIORITY: [RegExp, number][] = [
  [/^(careers|jobs|recruitment|hiring|hr|talent|apply|applications|employment|staffing|work)@/i, 100],
  [/^(manager|gm|generalmanager|owner|director|people|humanresources)@/i, 80],
  [/^(hello|team|contact|enquiries|enquiry|enquire)@/i, 40],
  [/^(info|mail|office|admin|reception|general|support|service|help|sales|booking|bookings|reservations|events)@/i, 20],
];

function emailScore(email: string): number {
  for (const [re, score] of JOB_PRIORITY) {
    if (re.test(email)) return score;
  }
  return 10; // unknown prefix — better than a clearly wrong one
}

// Return the single best email for a job application, or all if none stands out.
export function pickBestEmail(emails: string[]): string[] {
  if (emails.length <= 1) return emails;
  const scored = emails.map((e) => ({ e, s: emailScore(e) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  // If the top candidate has a clearly higher score than the rest, use only it.
  const second = scored[1];
  if (best.s >= 40 && best.s > second.s) return [best.e];
  // If there's a tie at the high-priority level, keep all tied winners.
  if (best.s >= 80) return scored.filter((x) => x.s === best.s).map((x) => x.e);
  // Otherwise fall back to just the best one to avoid spamming multiple inboxes.
  return [best.e];
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
  // ---- Europe (EU/EEA/Schengen destinations) ----
  {
    code: "DE",
    name: "Germany",
    visa: "EU work visa / employer sponsorship (e.g. EU Blue Card)",
    test: /\b(germany|deutschland|german|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|\.de\b)\b/i,
  },
  {
    code: "ES",
    name: "Spain",
    visa: "Spanish work / residence authorization (employer sponsorship)",
    test: /\b(spain|españa|spanish|madrid|barcelona|valencia|seville|sevilla|malaga|málaga|\.es\b)\b/i,
  },
  {
    code: "FR",
    name: "France",
    visa: "French work visa / employer sponsorship",
    test: /\b(france|french|paris|lyon|marseille|bordeaux|nice|toulouse|\.fr\b)\b/i,
  },
  {
    code: "IT",
    name: "Italy",
    visa: "Italian work visa (nulla osta / employer sponsorship)",
    test: /\b(italy|italia|italian|rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|\.it\b)\b/i,
  },
  {
    code: "NL",
    name: "the Netherlands",
    visa: "Dutch work permit (GVVA / employer sponsorship)",
    test: /\b(netherlands|holland|dutch|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|\.nl\b)\b/i,
  },
  {
    code: "PT",
    name: "Portugal",
    visa: "Portuguese work / residence visa (employer sponsorship)",
    test: /\b(portugal|portuguese|lisbon|lisboa|porto|algarve|madeira|\.pt\b)\b/i,
  },
  {
    code: "IE",
    name: "Ireland",
    visa: "Irish Employment Permit (employer sponsorship)",
    test: /\b(ireland|irish|dublin|cork|galway|\.ie\b)\b/i,
  },
  {
    code: "AT",
    name: "Austria",
    visa: "Austrian work permit (Rot-Weiß-Rot / employer sponsorship)",
    test: /\b(austria|österreich|austrian|vienna|wien|salzburg|innsbruck|graz|\.at\b)\b/i,
  },
  {
    code: "CH",
    name: "Switzerland",
    visa: "Swiss work permit (employer sponsorship)",
    test: /\b(switzerland|schweiz|suisse|swiss|zurich|zürich|geneva|genève|basel|bern|lausanne|\.ch\b)\b/i,
  },
  {
    code: "GR",
    name: "Greece",
    visa: "Greek work / residence permit (employer sponsorship)",
    test: /\b(greece|hellas|greek|athens|athína|thessaloniki|crete|santorini|mykonos|\.gr\b)\b/i,
  },
  {
    code: "SE",
    name: "Sweden",
    visa: "Swedish work permit (employer sponsorship)",
    test: /\b(sweden|sverige|swedish|stockholm|gothenburg|göteborg|malmö|\.se\b)\b/i,
  },
  {
    code: "DK",
    name: "Denmark",
    visa: "Danish work permit (employer sponsorship)",
    test: /\b(denmark|danmark|danish|copenhagen|københavn|aarhus|\.dk\b)\b/i,
  },
  {
    code: "NO",
    name: "Norway",
    visa: "Norwegian residence permit for work (employer sponsorship)",
    test: /\b(norway|norge|norwegian|oslo|bergen|trondheim|\.no\b)\b/i,
  },
  {
    code: "BE",
    name: "Belgium",
    visa: "Belgian work permit (employer sponsorship)",
    test: /\b(belgium|belgique|belgie|belgian|brussels|bruxelles|brussel|antwerp|antwerpen|ghent|gent|bruges|brugge|\.be\b)\b/i,
  },
  {
    code: "FI",
    name: "Finland",
    visa: "Finnish residence permit for work (employer sponsorship)",
    test: /\b(finland|suomi|finnish|helsinki|tampere|turku|oulu|\.fi\b)\b/i,
  },
  {
    code: "CZ",
    name: "Czech Republic",
    visa: "Czech work permit (employer sponsorship)",
    test: /\b(czech republic|česká republika|czech|prague|praha|brno|ostrava|\.cz\b)\b/i,
  },
  {
    code: "PL",
    name: "Poland",
    visa: "Polish work permit (employer sponsorship)",
    test: /\b(poland|polska|polish|warsaw|warszawa|kraków|wrocław|gdansk|\.pl\b)\b/i,
  },
];

export function detectCountry(text: string): CountryRule {
  for (const r of COUNTRY_RULES) if (r.test.test(text)) return { code: r.code, name: r.name, visa: r.visa };
  return { code: "XX", name: "the destination country", visa: "work visa sponsorship" };
}

// Canonical country/visa lookup by code (used when the AI layer returns a country code,
// so visa wording stays controlled rather than AI-generated).
export function countryByCode(code: string): CountryRule {
  const r = COUNTRY_RULES.find((c) => c.code === code.toUpperCase());
  return r ? { code: r.code, name: r.name, visa: r.visa } : { code: "XX", name: "the destination country", visa: "work visa sponsorship" };
}

const POSITION_RULES: { test: RegExp; label: string }[] = [
  { test: /\bfront desk|receptionist|front office|check.in|guest service/i, label: "Front Desk" },
  { test: /\bkitchen|chef|cook|kitchen hand|commis|sous chef|prep cook|dishwasher|kitchen porter/i, label: "Kitchen" },
  { test: /\bwait(er|ress)|server|serving|food service|f&b|dining room|table service/i, label: "Food & Beverage Service" },
  { test: /\bhousekeep|room attendant|cleaner|laundry|turndown/i, label: "Housekeeping" },
  { test: /\bbarista|coffee|café\b/i, label: "Barista" },
  { test: /\bbartender|bar staff|bar\b|cocktail|mixologist/i, label: "Bar" },
  { test: /\bconcierge|guest relations|guest experience/i, label: "Concierge" },
  { test: /\bmanager|management|supervisor|head of|general manager/i, label: "Management" },
  { test: /\bnight auditor|night shift|night manager/i, label: "Night Auditor" },
  { test: /\breservations|booking(s)?\b/i, label: "Reservations" },
  { test: /\bporter|bellhop|valet|doorman|luggage/i, label: "Porter / Valet" },
  { test: /\bevent|banquet|function|catering/i, label: "Events / Banquet" },
];

export function detectPositions(text: string): string[] {
  const hits = POSITION_RULES.filter((p) => p.test.test(text)).map((p) => p.label);
  return hits.length ? [...new Set(hits)] : [];
}

// Collapse a brand string that was duplicated by scraped logo markup:
// "Hotel Montreal Hotel Montreal" or "Hotel MontrealHotel Montreal" → "Hotel Montreal".
function collapseDouble(s: string): string {
  const compact = s.replace(/\s+/g, " ").trim();
  const words = compact.split(" ");
  if (words.length >= 2 && words.length % 2 === 0) {
    const h = words.length / 2;
    if (words.slice(0, h).join(" ").toLowerCase() === words.slice(h).join(" ").toLowerCase()) {
      return words.slice(0, h).join(" ");
    }
  }
  const n = compact.length;
  if (n >= 6 && n % 2 === 0) {
    const a = compact.slice(0, n / 2).trim();
    const b = compact.slice(n / 2).trim();
    if (a && a.toLowerCase() === b.toLowerCase()) return a;
  }
  return compact;
}

export function guessCompany(text: string, emails: string[]): string {
  // Prefer a content line that names a venue type.
  const venueLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /\b(hotel|suites|resort|restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie)\b/i.test(l) && l.length < 80);
  if (venueLine) return collapseDouble(venueLine.replace(/\s+[-–—|].*$/, "").trim());

  if (emails.length) {
    const domain = emails[0].split("@")[1] || "";
    const core = domain.split(".")[0];
    if (core && !/gmail|outlook|hotmail|yahoo|icloud|proton/i.test(core)) {
      return core.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3 && l.length < 80);
  return firstLine ? collapseDouble(firstLine) : "your company";
}

// Lightweight language detection of the pasted business text (for "auto" application language).
// Only switches away from English when there is clear, distinctive evidence. Hint words that
// collide with English or proper nouns (a, o, de, la, le, hotel, restaurant…) are deliberately
// EXCLUDED — they caused English hospitality copy (e.g. "a ... hotel") to be misread as
// Portuguese/Spanish. Language-unique diacritics weigh double. English-dominant or ambiguous
// text returns null, which the caller treats as English / the user's profile language.
const EN_HINTS = /\b(the|and|you|your|our|for|with|are|from|this|that|will|have|rooms?|booking|luxury|stay|guests?|city|welcome|enjoy|home|world|best|find|place|relaxed|comfort)\b/gi;

const LANG_HINTS: { code: string; words: RegExp; marks?: RegExp }[] = [
  { code: "es", words: /\b(los|las|para|con|una|por|trabajo|empresa|gracias|nuestro|empleo|habitaciones|ciudad|estancia|buscamos|camarero|camarera|cocina|calle|ayudante|ofrecemos|candidatos|jornada|sueldo|escribenos|escríbenos|restaurante|hostelería|hosteleria)\b/gi, marks: /[ñ¿¡]/g },
  { code: "fr", words: /\b(les|des|pour|avec|nous|votre|vous|travail|emploi|merci|équipe|chambres?|ville|séjour|nos|cet)\b/gi, marks: /[àâçèêëîïôùûœ]/g },
  { code: "de", words: /\b(und|der|die|das|für|mit|wir|unser|eine|arbeit|stelle|bewerbung|gäste|küche|zimmer|stadt|suchen)\b/gi, marks: /[äöüß]/g },
  { code: "it", words: /\b(gli|per|con|noi|una|nostro|lavoro|albergo|ristorante|grazie|cucina|camere?|città|soggiorno)\b/gi, marks: /[ìòù]/g },
  { code: "pt", words: /\b(para|com|nós|nosso|uma|trabalho|emprego|obrigado|equipa|cozinha|quartos?|cidade|estadia)\b/gi, marks: /[ãõ]/g },
  { code: "tr", words: /\b(ve|için|ile|bir|başvuru|otel|restoran|mutfak|ekip|departman|misafir|oda|şehir|çalışma)\b/gi, marks: /[şğıİ]/g },
];

export function detectTextLang(text: string): string | null {
  const sample = text.slice(0, 2000);
  const english = (sample.match(EN_HINTS) || []).length;
  let best: { code: string; n: number } | null = null;
  for (const h of LANG_HINTS) {
    const words = (sample.match(h.words) || []).length;
    const marks = h.marks ? (sample.match(h.marks) || []).length : 0;
    const n = words + marks * 2; // distinctive diacritics are a strong signal
    if (!best || n > best.n) best = { code: h.code, n };
  }
  // Require clear, distinctive evidence that also outweighs the English baseline.
  if (best && best.n >= 5 && best.n > english) return best.code;
  return null;
}

// A street-address line: a number + street name + a street-type suffix. Used to enrich
// the email web-search when the pasted text has a physical address but no email.
// Handles both English suffix-style ("24 Customs Street") and Romance/German prefix-style
// ("15 Rue de Rivoli", "42 Via Roma") street lines.
const STREET_RE =
  /\b\d{1,5}[a-z]?\s+(?:(?:rue|via|calle|avenida|piazza|plaza|viale|corso|strasse|straße)\s+(?:[A-Za-z][\w'’.-]+\s*){1,4}|(?:[A-Z][\w'’.-]+\s+){1,4}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|highway|hwy|quay|terrace|tce|place|pl|boulevard|blvd|parade|pde|crescent|cres|court|ct|square|sq|wharf|esplanade|str))\b\.?/i;

// Well-known cities/towns from the country rules — a strong locality signal for search.
const CITY_RE =
  /\b(auckland|wellington|christchurch|queenstown|hamilton|tauranga|dunedin|rotorua|napier|nelson|sydney|melbourne|brisbane|perth|adelaide|gold coast|cairns|byron bay|new york|los angeles|miami|chicago|san francisco|boston|seattle|toronto|vancouver|montreal|calgary|ottawa|london|manchester|edinburgh|glasgow|liverpool|bristol|birmingham|leeds|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|madrid|barcelona|valencia|seville|sevilla|malaga|málaga|paris|lyon|marseille|bordeaux|nice|toulouse|rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|lisbon|lisboa|porto|algarve|madeira|dublin|cork|galway|vienna|wien|salzburg|innsbruck|graz|zurich|zürich|geneva|genève|basel|bern|lausanne|athens|thessaloniki|crete|santorini|mykonos|stockholm|gothenburg|göteborg|malmö|copenhagen|københavn|aarhus|oslo|bergen|trondheim|brussels|bruxelles|antwerp|antwerpen|ghent|bruges|brugge|helsinki|tampere|turku|oulu|prague|praha|brno|ostrava|warsaw|warszawa|kraków|wrocław|gdansk)\b/i;

function titleCase(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Pull location hints (street address + city/town) from pasted business text. Both feed
// the email web-search so a generic or duplicated company name can still be pinned down.
export function extractLocation(text: string): { address?: string; locality?: string } {
  const out: { address?: string; locality?: string } = {};
  const street = text.match(STREET_RE);
  if (street) out.address = street[0].replace(/\s+/g, " ").replace(/\.$/, "").trim();
  const city = text.match(CITY_RE);
  if (city) out.locality = titleCase(city[0]);
  return out;
}

// Phone number — used as a web-search signal so we can pin the exact business.
// Matches: +64 9 302 1234 / (09) 302-1234 / 020 7946 0958 / +1 800 555 1234.
// Result is digit-only (with optional leading +) for a safe search query.
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-])?\(?\d{1,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?|\+\d{7,15}/g;

export function extractPhone(text: string): string | null {
  const hits = (text.match(PHONE_RE) || [])
    .map((h) => h.replace(/[^\d+]/g, ""))
    .filter((h) => h.replace(/\D/g, "").length >= 7);
  return hits[0] || null;
}

export type Analysis = {
  emails: string[];
  urls: string[];
  country: CountryRule;
  positions: string[];
  company: string;
  locality?: string;
  address?: string;
  phone?: string;
};

export function analyze(text: string): Analysis {
  const emails = extractEmails(text);
  const loc = extractLocation(text);
  return {
    emails,
    urls: extractUrls(text),
    country: detectCountry(text),
    positions: detectPositions(text),
    company: guessCompany(text, emails),
    locality: loc.locality,
    address: loc.address,
    phone: extractPhone(text) || undefined,
  };
}
