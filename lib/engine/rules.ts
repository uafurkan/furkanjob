// Hard application rules (from CLAUDE.md) — enforced for every draft, AI or template.
// These are product-wide invariants; per-user preferences layer on top via Profile.

export const RULES = {
  // E-posta adresleri YALNIZCA kaynaktan çıkarılır; asla üretilmez/tahmin edilmez.
  neverGuessEmails: true,
  // İmza / "Sincerely" / "Kind regards" YOK (Gmail imzası otomatik).
  noSignatureBlock: true,
  // Her başvuruda work visa sponsorship gerekliliği açıkça belirtilir.
  requireSponsorshipStatement: true,
  // Subject düz metin, "SUBJECT:" öneki yok.
  subjectNoPrefix: true,
} as const;

// Sensible defaults for a new profile (Furkan's preferences seed the first user).
export const DEFAULT_PROFILE = {
  fullName: "Furkan Hülako",
  contactEmail: "furkanhulakojob@gmail.com",
  languages: ["Turkish (Mother Tongue)", "English (B2 Level)", "Spanish (A2 Level)"],
  targetRoles: ["Front Desk", "Kitchen Serving"],
  needsVisaSponsorship: true,
  targetCountries: ["New Zealand", "Australia", "United States"],
  relocation: true,
  includeSignature: false,
  tone: "warm-professional",
} as const;

export type CountryRule = { code: string; name: string; visa: string };
