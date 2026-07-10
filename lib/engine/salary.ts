// Deterministic salary intelligence — country × role salary bands.
// Data sourced from 2024–2025 industry surveys and government wage databases.
// Precision: these are indicative bands, not guarantees.

export type SalaryPeriod = "hourly" | "annual";
export type SalaryBand = {
  min: number;
  max: number;
  currency: string;
  period: SalaryPeriod;
};
export type SalaryResult = {
  band: SalaryBand | null;
  note: string | null;
};

// Normalised role → salary band per country code.
// All hourly rates assume full-time; annual rates are FTE gross.
const SALARY_TABLE: Record<string, Record<string, SalaryBand>> = {
  NZ: {
    waiter:          { min: 23, max: 30, currency: "NZD", period: "hourly" },
    server:          { min: 23, max: 30, currency: "NZD", period: "hourly" },
    bartender:       { min: 23, max: 32, currency: "NZD", period: "hourly" },
    barista:         { min: 23, max: 28, currency: "NZD", period: "hourly" },
    "kitchen hand":  { min: 23, max: 26, currency: "NZD", period: "hourly" },
    chef:            { min: 28, max: 48, currency: "NZD", period: "hourly" },
    "sous chef":     { min: 33, max: 52, currency: "NZD", period: "hourly" },
    "head chef":     { min: 45, max: 80, currency: "NZD", period: "hourly" },
    "chef de partie":{ min: 28, max: 42, currency: "NZD", period: "hourly" },
    "front desk":    { min: 25, max: 33, currency: "NZD", period: "hourly" },
    "night audit":   { min: 26, max: 35, currency: "NZD", period: "hourly" },
    housekeeping:    { min: 23, max: 27, currency: "NZD", period: "hourly" },
    "hotel manager": { min: 65000, max: 120000, currency: "NZD", period: "annual" },
    nurse:           { min: 33, max: 58, currency: "NZD", period: "hourly" },
    dentist:         { min: 80000, max: 180000, currency: "NZD", period: "annual" },
    doctor:          { min: 100000, max: 250000, currency: "NZD", period: "annual" },
    electrician:     { min: 32, max: 65, currency: "NZD", period: "hourly" },
    plumber:         { min: 32, max: 65, currency: "NZD", period: "hourly" },
    carpenter:       { min: 28, max: 55, currency: "NZD", period: "hourly" },
    "farm worker":   { min: 23, max: 28, currency: "NZD", period: "hourly" },
    "farm manager":  { min: 55000, max: 90000, currency: "NZD", period: "annual" },
    teacher:         { min: 50000, max: 85000, currency: "NZD", period: "annual" },
    "software engineer": { min: 80000, max: 160000, currency: "NZD", period: "annual" },
  },
  AU: {
    waiter:          { min: 25, max: 33, currency: "AUD", period: "hourly" },
    server:          { min: 25, max: 33, currency: "AUD", period: "hourly" },
    barista:         { min: 25, max: 30, currency: "AUD", period: "hourly" },
    bartender:       { min: 25, max: 35, currency: "AUD", period: "hourly" },
    chef:            { min: 28, max: 52, currency: "AUD", period: "hourly" },
    "sous chef":     { min: 32, max: 55, currency: "AUD", period: "hourly" },
    "head chef":     { min: 45, max: 85, currency: "AUD", period: "hourly" },
    "kitchen hand":  { min: 25, max: 28, currency: "AUD", period: "hourly" },
    "front desk":    { min: 26, max: 35, currency: "AUD", period: "hourly" },
    housekeeping:    { min: 25, max: 29, currency: "AUD", period: "hourly" },
    nurse:           { min: 35, max: 65, currency: "AUD", period: "hourly" },
    dentist:         { min: 90000, max: 200000, currency: "AUD", period: "annual" },
    electrician:     { min: 36, max: 70, currency: "AUD", period: "hourly" },
    plumber:         { min: 36, max: 70, currency: "AUD", period: "hourly" },
    "software engineer": { min: 85000, max: 175000, currency: "AUD", period: "annual" },
    "farm worker":   { min: 25, max: 30, currency: "AUD", period: "hourly" },
    teacher:         { min: 55000, max: 100000, currency: "AUD", period: "annual" },
  },
  US: {
    waiter:          { min: 12, max: 20, currency: "USD", period: "hourly" },
    server:          { min: 12, max: 20, currency: "USD", period: "hourly" },
    bartender:       { min: 14, max: 25, currency: "USD", period: "hourly" },
    barista:         { min: 14, max: 20, currency: "USD", period: "hourly" },
    chef:            { min: 18, max: 40, currency: "USD", period: "hourly" },
    "sous chef":     { min: 22, max: 45, currency: "USD", period: "hourly" },
    "head chef":     { min: 30, max: 70, currency: "USD", period: "hourly" },
    "front desk":    { min: 15, max: 24, currency: "USD", period: "hourly" },
    housekeeping:    { min: 14, max: 20, currency: "USD", period: "hourly" },
    nurse:           { min: 35, max: 60, currency: "USD", period: "hourly" },
    electrician:     { min: 28, max: 55, currency: "USD", period: "hourly" },
    plumber:         { min: 26, max: 50, currency: "USD", period: "hourly" },
    "software engineer": { min: 100000, max: 220000, currency: "USD", period: "annual" },
    "farm worker":   { min: 14, max: 18, currency: "USD", period: "hourly" },
    teacher:         { min: 40000, max: 85000, currency: "USD", period: "annual" },
    dentist:         { min: 130000, max: 250000, currency: "USD", period: "annual" },
  },
  CA: {
    waiter:          { min: 16, max: 22, currency: "CAD", period: "hourly" },
    server:          { min: 16, max: 22, currency: "CAD", period: "hourly" },
    chef:            { min: 20, max: 40, currency: "CAD", period: "hourly" },
    "sous chef":     { min: 22, max: 45, currency: "CAD", period: "hourly" },
    "front desk":    { min: 18, max: 26, currency: "CAD", period: "hourly" },
    housekeeping:    { min: 16, max: 21, currency: "CAD", period: "hourly" },
    nurse:           { min: 32, max: 55, currency: "CAD", period: "hourly" },
    electrician:     { min: 30, max: 58, currency: "CAD", period: "hourly" },
    "software engineer": { min: 90000, max: 180000, currency: "CAD", period: "annual" },
    "farm worker":   { min: 16, max: 20, currency: "CAD", period: "hourly" },
    teacher:         { min: 55000, max: 100000, currency: "CAD", period: "annual" },
  },
  GB: {
    waiter:          { min: 11, max: 15, currency: "GBP", period: "hourly" },
    server:          { min: 11, max: 15, currency: "GBP", period: "hourly" },
    bartender:       { min: 11, max: 16, currency: "GBP", period: "hourly" },
    chef:            { min: 13, max: 26, currency: "GBP", period: "hourly" },
    "sous chef":     { min: 14, max: 28, currency: "GBP", period: "hourly" },
    "head chef":     { min: 18, max: 40, currency: "GBP", period: "hourly" },
    "front desk":    { min: 11, max: 16, currency: "GBP", period: "hourly" },
    housekeeping:    { min: 11, max: 14, currency: "GBP", period: "hourly" },
    nurse:           { min: 18, max: 35, currency: "GBP", period: "hourly" },
    electrician:     { min: 18, max: 35, currency: "GBP", period: "hourly" },
    "software engineer": { min: 50000, max: 120000, currency: "GBP", period: "annual" },
    teacher:         { min: 30000, max: 65000, currency: "GBP", period: "annual" },
    "farm worker":   { min: 11, max: 14, currency: "GBP", period: "hourly" },
  },
};

// Aliases to normalise role variants to table keys.
const ROLE_ALIASES: Record<string, string> = {
  "food and beverage": "waiter",
  "f&b": "waiter",
  "waitress": "waiter",
  "wait staff": "waiter",
  "commis chef": "kitchen hand",
  "hotel receptionist": "front desk",
  "receptionist": "front desk",
  "accommodation manager": "hotel manager",
  "general manager": "hotel manager",
  "housekeeper": "housekeeping",
  "room attendant": "housekeeping",
  "registered nurse": "nurse",
  "rn": "nurse",
  "dental surgeon": "dentist",
  "physician": "doctor",
  "gp": "doctor",
  "dev": "software engineer",
  "developer": "software engineer",
  "programmer": "software engineer",
  "engineer": "software engineer",
};

function normalise(role: string): string {
  const lower = role.toLowerCase().trim();
  return ROLE_ALIASES[lower] ?? lower;
}

export function getSalaryBand(roles: string[], countryCode: string): SalaryResult {
  const table = SALARY_TABLE[countryCode.toUpperCase()];
  if (!table) return { band: null, note: null };

  for (const role of roles) {
    const key = normalise(role);
    if (table[key]) return { band: table[key], note: null };
    // Partial match: role contains a known key
    const partialMatch = Object.keys(table).find(
      (k) => key.includes(k) || k.includes(key.split(" ")[0])
    );
    if (partialMatch) return { band: table[partialMatch], note: null };
  }

  return { band: null, note: null };
}

export function formatSalaryBand(band: SalaryBand): string {
  if (band.period === "hourly") {
    return `${band.currency} ${band.min}–${band.max}/hr`;
  }
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  return `${band.currency} ${fmt(band.min)}–${fmt(band.max)}/yr`;
}
