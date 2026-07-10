// Per-country visa type options shown to users who need sponsorship.
// Covers the most common sponsored-work pathways. "other" is always appended
// so the user can type a custom value for unlisted programs.

export type VisaTypeEntry = {
  id: string;
  label: string;
  description: string;
};

export const COUNTRY_VISA_TYPES: Record<string, VisaTypeEntry[]> = {
  AU: [
    { id: "482", label: "482 / TSS", description: "Temporary Skill Shortage" },
    { id: "DAMA", label: "DAMA", description: "Designated Area Migration Agreement" },
    { id: "186", label: "186 / ENS", description: "Employer Nomination Scheme (permanent)" },
    { id: "417", label: "417 / WHV", description: "Working Holiday Visa" },
    { id: "462", label: "462 / WHV", description: "Work & Holiday Visa (select countries)" },
  ],
  NZ: [
    { id: "AEWV", label: "AEWV", description: "Accredited Employer Work Visa" },
    { id: "silver-fern", label: "Silver Fern", description: "Silver Fern Resident Visa" },
    { id: "whv-nz", label: "WHV (NZ)", description: "NZ Working Holiday Visa" },
  ],
  UK: [
    { id: "skilled-worker", label: "Skilled Worker", description: "UK Skilled Worker Visa" },
    { id: "health-care", label: "Health & Care", description: "UK Health and Care Worker Visa" },
    { id: "seasonal", label: "Seasonal Worker", description: "UK Seasonal Worker Visa" },
    { id: "graduate", label: "Graduate Route", description: "UK Graduate Route (post-study)" },
  ],
  US: [
    { id: "h1b", label: "H-1B", description: "Specialty Occupation" },
    { id: "h2b", label: "H-2B", description: "Non-agricultural Seasonal Work" },
    { id: "o1", label: "O-1", description: "Extraordinary Ability" },
    { id: "eb3", label: "EB-3", description: "Employment-Based Green Card (Skilled)" },
    { id: "j1", label: "J-1", description: "Exchange Visitor Program" },
  ],
  CA: [
    { id: "lmia", label: "LMIA", description: "Labour Market Impact Assessment" },
    { id: "iec", label: "IEC / WHV", description: "International Experience Canada" },
    { id: "pr-express", label: "Express Entry", description: "Permanent Residency pathway" },
  ],
  DE: [
    { id: "skilled-immigration", label: "Fachkräfte (FEG)", description: "Skilled Immigration Act (Fachkräfteeinwanderungsgesetz)" },
    { id: "chancenkarte", label: "Chancenkarte", description: "Opportunity Card / Job Seeker Visa" },
    { id: "eu-blue", label: "EU Blue Card", description: "EU Blue Card (high-skilled)" },
  ],
  AE: [
    { id: "employment-uae", label: "Employment Visa", description: "UAE Employment Visa (employer-sponsored)" },
    { id: "golden-uae", label: "Golden Visa", description: "UAE Golden Visa (10-year, talent/investor)" },
    { id: "green-uae", label: "Green Visa", description: "UAE Green Visa (freelance/skilled)" },
  ],
  SG: [
    { id: "ep", label: "Employment Pass", description: "Employment Pass (EP) — professionals" },
    { id: "s-pass", label: "S Pass", description: "S Pass — mid-level skilled workers" },
    { id: "work-permit", label: "Work Permit", description: "Work Permit — semi-skilled" },
    { id: "pep", label: "PEP", description: "Personalised Employment Pass" },
  ],
  IE: [
    { id: "critical-skills", label: "Critical Skills", description: "Critical Skills Employment Permit" },
    { id: "general-employment", label: "General Employment", description: "General Employment Permit" },
  ],
  NL: [
    { id: "highly-skilled-nl", label: "Highly Skilled Migrant", description: "Netherlands Highly Skilled Migrant Permit" },
    { id: "eu-blue-nl", label: "EU Blue Card (NL)", description: "EU Blue Card via Netherlands" },
  ],
  SE: [
    { id: "work-permit-se", label: "Work Permit (SE)", description: "Swedish Work Permit" },
    { id: "eu-blue-se", label: "EU Blue Card (SE)", description: "EU Blue Card via Sweden" },
  ],
  NO: [
    { id: "skilled-worker-no", label: "Skilled Worker (NO)", description: "Norwegian Skilled Worker Permit" },
  ],
  DK: [
    { id: "pay-limit-dk", label: "Pay Limit Scheme", description: "Danish Pay Limit Scheme" },
    { id: "positive-list-dk", label: "Positive List", description: "Danish Positive List Permit" },
  ],
  JP: [
    { id: "specified-skilled-jp", label: "Specified Skilled Worker", description: "Japan Specified Skilled Worker (SSW)" },
    { id: "engineer-jp", label: "Engineer/Specialist", description: "Japan Engineer / Specialist in Humanities" },
    { id: "whv-jp", label: "WHV (Japan)", description: "Japan Working Holiday Visa" },
  ],
};

// Returns the visa types for a country code, or null if not tracked.
export function getVisaTypesForCountry(countryCode: string): VisaTypeEntry[] | null {
  return COUNTRY_VISA_TYPES[countryCode.toUpperCase()] ?? null;
}

// Formats a visa type id into a human-readable label for AI prompts.
export function visaTypeLabel(countryCode: string, visaTypeId: string): string {
  const types = getVisaTypesForCountry(countryCode);
  if (!types) return visaTypeId;
  const entry = types.find((t) => t.id === visaTypeId);
  return entry ? `${entry.label} (${entry.description})` : visaTypeId;
}
