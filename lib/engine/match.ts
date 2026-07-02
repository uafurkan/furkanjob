// Role best-fit matching — cross-industry. The user's target roles are their *wish list*; a
// given organization only offers some of them. Applying to a dental clinic as a "Night Auditor"
// (or to a motel as a "Dentist") reads as spam and hurts the applicant. This module intersects
// the user's target roles with what the organization actually offers/plausibly employs and
// returns only the roles worth applying for — with the rest explained.
//
// Pure + deterministic: used directly as the no-AI fallback, and as a sanity net behind aiAssessFit.
// The profession taxonomy and org-type detection live in ./professions (single source of truth).

import {
  PROFESSIONS,
  categoriesOfRole,
  detectOrgType,
  orgAcceptsProfession,
  type OrgType,
  type Profession,
} from "./professions";

export type RoleMatch = {
  applyFor: string[];   // the user's own role labels that fit this organization (apply for these)
  dropped: string[];    // target roles that don't fit this organization
  reason: string;       // short human explanation
  venue: OrgType;       // detected organization type
};

// Back-compat alias (older callers/tests referred to hospitality "venues").
export type VenueType = OrgType;

// Re-export so existing imports of inferVenue keep working; positions+text → org type.
export function inferVenue(businessPositions: string[], text?: string): OrgType {
  return detectOrgType(text || "", businessPositions);
}

function categoryIds(role: string): Profession[] {
  return categoriesOfRole(role);
}

/**
 * Pick the user's roles that fit this organization.
 * - If the organization advertises positions: applyFor = target roles whose profession category
 *   overlaps the organization's advertised categories.
 * - Else: keep target roles whose category the detected org type plausibly employs.
 * - If nothing overlaps: keep the user's own top target roles as a "stretch" application —
 *   never substitute an unrelated role. The AI fit layer scores/flags it.
 */
export function pickRelevantRoles(
  targetRoles: string[],
  businessPositions: string[],
  venueType?: OrgType,
  text?: string
): RoleMatch {
  const targets = (targetRoles || []).map((s) => s.trim()).filter(Boolean);
  const bizPositions = (businessPositions || []).map((s) => s.trim()).filter(Boolean);
  const venue = venueType || inferVenue(bizPositions, text);

  if (!targets.length) {
    // No target roles set → just use what the organization offers (or nothing).
    return { applyFor: bizPositions.slice(0, 2), dropped: [], reason: "", venue };
  }

  const bizCats = new Set(bizPositions.flatMap((p) => categoryIds(p).map((c) => c.id)));
  const applyFor: string[] = [];
  const dropped: string[] = [];

  for (const role of targets) {
    const cats = categoryIds(role);
    // A role fits if: the organization advertised an overlapping category, OR (nothing specific
    // advertised) the detected org type plausibly employs that category.
    const fitsBusiness = bizCats.size > 0
      ? cats.some((c) => bizCats.has(c.id))
      : cats.some((c) => orgAcceptsProfession(venue, c));
    // Even when categories overlap on paper, drop a role the org type can't employ
    // (e.g. lodging-only roles at a standalone restaurant, clinical roles at a cafe).
    const venueOk = cats.length === 0
      ? venue !== "generic"
      : cats.some((c) => orgAcceptsProfession(venue, c));
    if (fitsBusiness && venueOk) applyFor.push(role);
    else dropped.push(role);
  }

  let reason = "";
  if (dropped.length && applyFor.length) {
    reason = `${dropped.join(" / ")} ${dropped.length > 1 ? "are" : "is"} not a fit for a ${venue.replace(/_/g, " ")}; applying as ${applyFor.join(" / ")}.`;
  } else if (dropped.length && !applyFor.length) {
    // Nothing fit. Keep the user's own target roles as a stretch — don't substitute a
    // completely unrelated role (e.g. don't suggest "Waiter" to someone targeting "Dentist").
    // The AI layer will assess fit and may flag low score or blocked eligibility.
    reason = `None of your target roles directly match this ${venue.replace(/_/g, " ")}; applying anyway as ${targets.slice(0, 2).join(" / ")}.`;
    return { applyFor: targets.slice(0, 2), dropped: [], reason, venue };
  }

  return { applyFor: applyFor.length ? applyFor : bizPositions.slice(0, 2), dropped, reason, venue };
}

export { PROFESSIONS };
