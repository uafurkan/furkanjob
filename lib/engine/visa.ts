// Visa intelligence: maps a held visa to the set of countries it authorizes work in,
// so the pipeline can recognize when a pasted job's destination is already covered.
// Coverage here is a pragmatic product model, NOT legal advice — the user can always edit it.

// ---------- Country groups (ISO 3166-1 alpha-2) ----------
export const EU = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
export const EEA = [...EU, "IS", "LI", "NO"];
export const SCHENGEN = [
  "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS",
  "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI",
  "ES", "SE", "CH",
];

// Human-readable names for the codes we may surface (covers EU/EEA + the non-EU destinations).
export const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
  CZ: "Czechia", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
  LV: "Latvia", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg",
  MT: "Malta", NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania",
  SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden", IS: "Iceland",
  NO: "Norway", CH: "Switzerland",
  NZ: "New Zealand", AU: "Australia", US: "United States", CA: "Canada", UK: "United Kingdom",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

// ---------- Visa presets (the structured selector) ----------
export type VisaType = { id: string; label: string; countries: string[] };

export const VISA_TYPES: VisaType[] = [
  { id: "eu_work", label: "EU work permit / EU Blue Card", countries: EEA },
  { id: "schengen", label: "Schengen visa", countries: SCHENGEN },
  { id: "es_work", label: "Spain work / residence permit", countries: ["ES"] },
  { id: "de_work", label: "Germany work / residence permit", countries: ["DE"] },
  { id: "fr_work", label: "France work / residence permit", countries: ["FR"] },
  { id: "it_work", label: "Italy work / residence permit", countries: ["IT"] },
  { id: "nl_work", label: "Netherlands work / residence permit", countries: ["NL"] },
  { id: "pt_work", label: "Portugal work / residence permit", countries: ["PT"] },
  { id: "ie_work", label: "Ireland work permit", countries: ["IE"] },
  { id: "uk_work", label: "UK work / Skilled Worker visa", countries: ["UK"] },
  { id: "us_work", label: "US work authorization", countries: ["US"] },
  { id: "ca_work", label: "Canada work permit", countries: ["CA"] },
  { id: "au_work", label: "Australia work visa", countries: ["AU"] },
  { id: "nz_work", label: "New Zealand work visa", countries: ["NZ"] },
  { id: "custom", label: "Other (pick countries manually)", countries: [] },
];

export function visaTypeById(id: string | null | undefined): VisaType | null {
  if (!id) return null;
  return VISA_TYPES.find((v) => v.id === id) || null;
}

export function resolveVisaCountries(typeId: string | null | undefined): string[] {
  return visaTypeById(typeId)?.countries.slice() || [];
}

// Does a held visa (set of covered country codes) authorize work in the detected destination?
export function isVisaCovered(visaCountries: string[] | undefined | null, destCode: string): boolean {
  if (!visaCountries?.length || !destCode || destCode === "XX") return false;
  const dest = destCode.toUpperCase();
  return visaCountries.map((c) => c.toUpperCase()).includes(dest);
}

// Normalize/validate a list of country codes against the names we know.
export function sanitizeCountryCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const seen = new Set<string>();
  for (const c of codes) {
    const up = String(c).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (up.length === 2 && COUNTRY_NAMES[up]) seen.add(up);
  }
  return [...seen];
}
