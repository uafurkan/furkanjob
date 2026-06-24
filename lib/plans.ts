// Plan limits & gating. Every tier gets smart AI; the tier only selects WHICH model:
// Free runs on a free-but-smart provider (e.g. Groq/Gemini), Pro on the premium model (Claude).
import type { Plan } from "./types";

export const FREE_MONTHLY_LIMIT = Number(process.env.FREE_MONTHLY_LIMIT || 15);

export const PLANS = {
  free: { name: "Free", monthlyLimit: FREE_MONTHLY_LIMIT, ai: true, price: "€0" },
  pro: { name: "Pro", monthlyLimit: Infinity, ai: true, price: "€12/mo" },
  team: { name: "Team", monthlyLimit: Infinity, ai: true, price: "Contact" },
} as const;

export function planInfo(plan: Plan) {
  return PLANS[plan] || PLANS.free;
}

// Which model tier a plan should use. Free → free provider; paid → premium.
export function aiTier(plan: Plan): "free" | "pro" {
  return plan === "free" ? "free" : "pro";
}

export function remainingQuota(plan: Plan, used: number): number {
  const limit = planInfo(plan).monthlyLimit;
  return limit === Infinity ? Infinity : Math.max(0, limit - used);
}

export function isOverLimit(plan: Plan, used: number): boolean {
  return remainingQuota(plan, used) <= 0;
}
