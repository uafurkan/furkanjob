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

// Neutral defaults for a brand-new profile. Nothing user-specific — each person fills these in
// during onboarding. (This is a global product, not tied to any individual.)
export const DEFAULT_PROFILE = {
  fullName: "",
  contactEmail: "",
  languages: [] as string[],
  targetRoles: [] as string[],
  needsVisaSponsorship: true, // common case for this niche; user can turn it off
  targetCountries: [] as string[],
  relocation: true,
  includeSignature: false,
  tone: "warm-professional",
  applicationLanguage: "auto",
} as const;

export type CountryRule = { code: string; name: string; visa: string };
