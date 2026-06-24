// Plan limits & gating. AI generation is a Pro perk (cost control); Free uses the smart template.
import type { Plan } from "./types";

export const FREE_MONTHLY_LIMIT = Number(process.env.FREE_MONTHLY_LIMIT || 15);

export const PLANS = {
  free: { name: "Free", monthlyLimit: FREE_MONTHLY_LIMIT, ai: false, price: "€0" },
  pro: { name: "Pro", monthlyLimit: Infinity, ai: true, price: "€12/mo" },
  team: { name: "Team", monthlyLimit: Infinity, ai: true, price: "Contact" },
} as const;

export function planInfo(plan: Plan) {
  return PLANS[plan] || PLANS.free;
}

export function canUseAI(plan: Plan): boolean {
  return planInfo(plan).ai && Boolean(process.env.ANTHROPIC_API_KEY);
}

export function remainingQuota(plan: Plan, used: number): number {
  const limit = planInfo(plan).monthlyLimit;
  return limit === Infinity ? Infinity : Math.max(0, limit - used);
}

export function isOverLimit(plan: Plan, used: number): boolean {
  return remainingQuota(plan, used) <= 0;
}
