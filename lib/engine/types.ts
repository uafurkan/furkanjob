// Shared engine types. EngineProfile is the subset of the DB Profile the generator needs.
import type { Analysis } from "./detect";

export type EngineProfile = {
  fullName: string;
  contactEmail?: string | null;
  phone?: string | null;
  languages: string[];
  targetRoles: string[];
  needsVisaSponsorship: boolean;
  targetCountries: string[];
  shortBio?: string | null;
  availability?: string | null;
  currentCountry?: string | null;
  relocation: boolean;
  includeSignature: boolean;
  tone: string;
  applicationLanguage: string; // "auto" | en | tr | es | fr | de | it | pt
  // Held-visa intelligence: if the destination falls within visaCountries, the draft
  // states existing work authorization instead of asking for sponsorship.
  hasVisa?: boolean;
  visaLabel?: string | null;
  visaCountries?: string[];
  // Raw text extracted from the applicant's CV PDF — injected into AI prompts for richer, more specific drafts.
  cvText?: string | null;
  // Labeled text extracts from the applicant's OTHER uploaded documents (visa proof,
  // certificates, diplomas, reference letters) — so every AI feature knows the full person.
  documentsText?: string | null;
};

export type Draft = { subject: string; body: string };
export type DraftOption = { subject: string; body: string; style: string };

export type GenerateInput = {
  text: string;
  analysis: Analysis;
  profile: EngineProfile;
};
