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
  relocation: boolean;
  includeSignature: boolean;
  tone: string;
  applicationLanguage: string; // "auto" | en | tr | es | fr | de | it | pt
};

export type Draft = { subject: string; body: string };

export type GenerateInput = {
  text: string;
  analysis: Analysis;
  profile: EngineProfile;
};
