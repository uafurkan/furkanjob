// Thin wrapper over the DB-backed fixed-window limiter with per-action budgets.
import { hitRateLimit } from "./db";

const LIMITS: Record<string, { limit: number; windowSec: number }> = {
  generate: { limit: 20, windowSec: 60 },   // 20 drafts / minute
  send: { limit: 12, windowSec: 60 },        // 12 sends / minute
  upload: { limit: 30, windowSec: 300 },     // 30 uploads / 5 minutes
  account: { limit: 6, windowSec: 300 },     // export/delete attempts
};

export type RateResult = { ok: boolean; retryAfter: number };

export async function rateLimit(userId: string, action: keyof typeof LIMITS | string): Promise<RateResult> {
  const cfg = LIMITS[action];
  if (!cfg) return { ok: true, retryAfter: 0 };
  const count = await hitRateLimit(userId, action, cfg.windowSec);
  if (count > cfg.limit) return { ok: false, retryAfter: cfg.windowSec };
  return { ok: true, retryAfter: 0 };
}
