import type { Profile, User } from "./types";
import type { EngineProfile } from "./engine/types";
import { DEFAULT_PROFILE } from "./engine/rules";

// Map a stored Profile (or sensible defaults) into what the generator needs.
export function toEngineProfile(profile: Profile | null, user: User | null): EngineProfile {
  if (profile) {
    return {
      fullName: profile.fullName || user?.name || DEFAULT_PROFILE.fullName,
      contactEmail: profile.contactEmail,
      phone: profile.phone,
      languages: profile.languages?.length ? profile.languages : [...DEFAULT_PROFILE.languages],
      targetRoles: profile.targetRoles?.length ? profile.targetRoles : [...DEFAULT_PROFILE.targetRoles],
      needsVisaSponsorship: profile.needsVisaSponsorship,
      targetCountries: profile.targetCountries?.length ? profile.targetCountries : [...DEFAULT_PROFILE.targetCountries],
      shortBio: profile.shortBio,
      availability: profile.availability,
      relocation: profile.relocation,
      includeSignature: profile.includeSignature,
      tone: profile.tone,
    };
  }
  return {
    fullName: user?.name || DEFAULT_PROFILE.fullName,
    contactEmail: user?.email || DEFAULT_PROFILE.contactEmail,
    phone: null,
    languages: [...DEFAULT_PROFILE.languages],
    targetRoles: [...DEFAULT_PROFILE.targetRoles],
    needsVisaSponsorship: DEFAULT_PROFILE.needsVisaSponsorship,
    targetCountries: [...DEFAULT_PROFILE.targetCountries],
    shortBio: null,
    availability: null,
    relocation: DEFAULT_PROFILE.relocation,
    includeSignature: DEFAULT_PROFILE.includeSignature,
    tone: DEFAULT_PROFILE.tone,
  };
}
