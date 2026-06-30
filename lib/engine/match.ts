// Role best-fit matching. The user's target roles are their *wish list*; a given business
// only offers some of them. Applying to a restaurant as a "Night Auditor" reads as spam and
// hurts the applicant. This module intersects the user's target roles with what the business
// actually offers and returns only the roles worth applying for — with the rest explained.
//
// Pure + deterministic: used directly as the no-AI fallback, and as a sanity net behind aiAssessFit.

export type RoleMatch = {
  applyFor: string[];   // the user's own role labels that fit this business (apply for these)
  dropped: string[];    // target roles that don't fit this business (with reason in `reason`)
  reason: string;       // short human explanation, e.g. "Front Desk / Night Audit are lodging roles; this is a restaurant."
  venue: VenueType;
};

export type VenueType = "hotel" | "restaurant" | "cafe" | "bar" | "farm" | "generic";

type Category = {
  id: string;
  keywords: string[];
  // Roles that only make sense where there is lodging (a hotel/motel/lodge). They are dropped
  // when the venue is a standalone restaurant/cafe/bar.
  accommodationOnly?: boolean;
  // Roles that only make sense on a farm/vineyard/agricultural setting.
  farmOnly?: boolean;
};

// Canonical role categories with the synonyms that map onto them. Mirrors detect.ts POSITION_RULES
// but is matching-oriented (one category per concept, with accommodation flags).
const CATEGORIES: Category[] = [
  { id: "front_desk", accommodationOnly: true, keywords: ["front desk", "reception", "receptionist", "front office", "guest service", "guest relations", "check-in", "check in", "guest experience"] },
  { id: "night_audit", accommodationOnly: true, keywords: ["night audit", "night auditor", "night shift", "night manager"] },
  { id: "housekeeping", accommodationOnly: true, keywords: ["housekeep", "room attendant", "chambermaid", "turndown", "laundry"] },
  { id: "concierge", accommodationOnly: true, keywords: ["concierge"] },
  { id: "reservations", accommodationOnly: true, keywords: ["reservation", "booking"] },
  { id: "porter", accommodationOnly: true, keywords: ["porter", "bellhop", "bellboy", "valet", "doorman", "luggage"] },
  { id: "food_service", keywords: ["waiter", "waitress", "server", "serving", "food service", "f&b", "food and beverage", "food & beverage", "dining room", "table service", "front of house", "foh", "busser", "runner", "host", "hostess"] },
  { id: "kitchen", keywords: ["kitchen", "chef", "cook", "kitchen hand", "commis", "sous chef", "prep cook", "dishwasher", "kitchen porter", "line cook", "culinary"] },
  { id: "barista", keywords: ["barista", "coffee", "café", "cafe"] },
  { id: "bar", keywords: ["bartender", "bar staff", "bar back", "barback", "cocktail", "mixologist", "bar attendant"] },
  { id: "events", keywords: ["event", "banquet", "function", "catering", "conference"] },
  { id: "management", keywords: ["manager", "management", "supervisor", "head of", "general manager", "duty manager", "team lead"] },
  { id: "cleaning", keywords: ["cleaner", "cleaning"] },
  { id: "farm", farmOnly: true, keywords: ["farm worker", "farm hand", "farmhand", "vineyard", "harvest", "picking", "pruning", "orchard", "crop", "agricultural", "seasonal worker", "field work", "grower", "horticulture"] },
];

function categoriesOf(role: string): string[] {
  // Normalize & → "and" so "Food & Beverage" matches "food and beverage" keyword
  const r = ` ${role.toLowerCase().replace(/\s*&\s*/g, " and ")} `;
  const hits = CATEGORIES.filter((c) => c.keywords.some((k) => r.includes(k))).map((c) => c.id);
  return [...new Set(hits)];
}

function isAccommodationCategory(id: string): boolean {
  return Boolean(CATEGORIES.find((c) => c.id === id)?.accommodationOnly);
}

function isFarmCategory(id: string): boolean {
  return Boolean(CATEGORIES.find((c) => c.id === id)?.farmOnly);
}

// Infer the venue from the roles the business actually advertises (plus optional raw text).
export function inferVenue(businessPositions: string[], text?: string): VenueType {
  const cats = new Set(businessPositions.flatMap(categoriesOf));
  const t = (text || "").toLowerCase();
  const hasLodging = [...cats].some(isAccommodationCategory) || /\b(hotel|motel|lodge|inn|resort|b&b|bed and breakfast|accommodation|guesthouse)\b/.test(t);
  if (hasLodging) return "hotel";
  const hasFarm = cats.has("farm") || /\b(vineyard|winery|orchard|farm|harvest|picking|horticulture|agricultural)\b/.test(t);
  if (hasFarm) return "farm";
  // A real kitchen or table service = restaurant, even when the place also pulls coffee (Barista).
  if (cats.has("kitchen") || cats.has("food_service") || /\b(restaurant|bistro|eatery|dining|brasserie|trattoria)\b/.test(t)) return "restaurant";
  if (cats.has("barista") || /\b(cafe|café|coffee)\b/.test(t)) return "cafe";
  if (cats.has("bar") || /\b(cocktail bar|wine bar|pub)\b/.test(t)) return "bar";
  return "generic";
}

// Which categories does a given venue plausibly employ?
function venueAcceptsCategory(venue: VenueType, categoryId: string): boolean {
  // Hotels and farms with restaurants are multi-department — accept all categories.
  if (venue === "hotel" || venue === "generic") return true;
  // Farm venues accept farm roles + hospitality (many farms have restaurants/cellar door).
  if (venue === "farm") return true;
  // Standalone restaurant/cafe/bar: no lodging or farm-only roles.
  if (isAccommodationCategory(categoryId) || isFarmCategory(categoryId)) return false;
  return true;
}

/**
 * Pick the user's roles that fit this business.
 * - If the business advertises positions: applyFor = target roles whose category overlaps the business's.
 * - Else: keep target roles whose category fits the inferred venue.
 * - If nothing overlaps: fall back to the single best venue-appropriate target role ("stretch"),
 *   else to the business's own top position.
 */
export function pickRelevantRoles(
  targetRoles: string[],
  businessPositions: string[],
  venueType?: VenueType,
  text?: string
): RoleMatch {
  const targets = (targetRoles || []).map((s) => s.trim()).filter(Boolean);
  const bizPositions = (businessPositions || []).map((s) => s.trim()).filter(Boolean);
  const venue = venueType || inferVenue(bizPositions, text);

  if (!targets.length) {
    // No target roles set → just use what the business offers (or nothing).
    return { applyFor: bizPositions.slice(0, 2), dropped: [], reason: "", venue };
  }

  const bizCats = new Set(bizPositions.flatMap(categoriesOf));
  const applyFor: string[] = [];
  const dropped: string[] = [];

  for (const role of targets) {
    const cats = categoriesOf(role);
    // A role fits if: the business advertised an overlapping category, OR (business listed nothing
    // specific) the venue plausibly employs that category.
    const fitsBusiness = bizCats.size > 0
      ? cats.some((c) => bizCats.has(c))
      : cats.some((c) => venueAcceptsCategory(venue, c));
    // Even when the business overlaps, drop a lodging-only role at a non-lodging venue.
    const venueOk = cats.length === 0 ? venue !== "generic" : cats.some((c) => venueAcceptsCategory(venue, c));
    if (fitsBusiness && venueOk) applyFor.push(role);
    else dropped.push(role);
  }

  let reason = "";
  if (dropped.length && applyFor.length) {
    reason = `${dropped.join(" / ")} ${dropped.length > 1 ? "are" : "is"} not a fit for a ${venue}; applying as ${applyFor.join(" / ")}.`;
  } else if (dropped.length && !applyFor.length) {
    // Nothing fit. Keep the user's own target roles as a stretch — don't substitute a
    // completely unrelated role (e.g. don't suggest "Waiter" to someone targeting "Farm Worker").
    // The AI layer will assess fit and may flag low score or blocked eligibility.
    reason = `None of your target roles directly match this ${venue}; applying anyway as ${targets.slice(0, 2).join(" / ")}.`;
    return { applyFor: targets.slice(0, 2), dropped: [], reason, venue };
  }

  return { applyFor: applyFor.length ? applyFor : bizPositions.slice(0, 2), dropped, reason, venue };
}
