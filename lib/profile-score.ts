import type { Profile } from "./types";

// A simple profile-completeness score that nudges users to fill the fields that
// make applications stronger. Each check is equally weighted.
export type ScoreItem = { key: string; done: boolean };
export type ProfileScore = { pct: number; items: ScoreItem[]; missing: string[] };

export function computeProfileScore(
  profile: Profile | null,
  cvCount: number,
  gmailConnected: boolean
): ProfileScore {
  const items: ScoreItem[] = [
    { key: "name", done: !!profile?.fullName?.trim() },
    { key: "email", done: !!profile?.contactEmail?.trim() },
    { key: "languages", done: (profile?.languages?.length || 0) > 0 },
    { key: "roles", done: (profile?.targetRoles?.length || 0) > 0 },
    { key: "countries", done: (profile?.targetCountries?.length || 0) > 0 },
    { key: "currentCountry", done: !!profile?.currentCountry?.trim() },
    { key: "bio", done: !!profile?.shortBio?.trim() },
    { key: "cv", done: cvCount > 0 },
    { key: "gmail", done: gmailConnected },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    pct: Math.round((done / items.length) * 100),
    items,
    missing: items.filter((i) => !i.done).map((i) => i.key),
  };
}
