// Shared application-status metadata for the tracking pipeline.
export const APP_STATUSES = ["draft", "sent", "replied", "interview", "offer", "rejected", "failed"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

// Statuses the user can set by hand (draft/failed are system-assigned).
export const SETTABLE_STATUSES: AppStatus[] = ["sent", "replied", "interview", "offer", "rejected"];

// Pipeline columns shown in the board summary, in order.
export const PIPELINE_STATUSES: AppStatus[] = ["sent", "replied", "interview", "offer", "rejected"];

// Chip colour class per status.
export const STATUS_CLASS: Record<string, string> = {
  sent: "chip-ok",
  replied: "chip-accent",
  interview: "chip-accent",
  offer: "chip-ok",
  rejected: "chip-warn",
  failed: "chip-warn",
  draft: "",
};

// A "sent" application with no further status update after this many days is due a follow-up.
export const FOLLOWUP_DAYS = 7;

export function isFollowupDue(status: string, sentAt: string | null, createdAt: string): boolean {
  if (status !== "sent") return false;
  const base = sentAt || createdAt;
  const ageDays = (Date.now() - new Date(base).getTime()) / (1000 * 3600 * 24);
  return ageDays >= FOLLOWUP_DAYS;
}

// ---------- Insights (response-rate analytics over the pipeline) ----------
const DISPATCHED = new Set(["sent", "replied", "interview", "offer", "rejected"]);
const RESPONDED = new Set(["replied", "interview", "offer", "rejected"]);
const POSITIVE = new Set(["replied", "interview", "offer"]);

export type InsightRow = { name: string; count: number; responded: number };
export type Insights = {
  dispatched: number;
  responded: number;
  positive: number;
  interview: number;
  offer: number;
  responseRate: number; // 0..1
  byCountry: InsightRow[];
  byRole: InsightRow[];
};

type AppLike = { status: string; country?: string | null; positions?: string[] };

export function computeInsights(apps: AppLike[]): Insights {
  const dispatchedApps = apps.filter((a) => DISPATCHED.has(a.status));
  const responded = dispatchedApps.filter((a) => RESPONDED.has(a.status)).length;
  const positive = dispatchedApps.filter((a) => POSITIVE.has(a.status)).length;
  const interview = apps.filter((a) => a.status === "interview").length;
  const offer = apps.filter((a) => a.status === "offer").length;

  const countryMap = new Map<string, InsightRow>();
  const roleMap = new Map<string, InsightRow>();
  for (const a of dispatchedApps) {
    const isResp = RESPONDED.has(a.status) ? 1 : 0;
    const c = (a.country || "—").trim() || "—";
    const cr = countryMap.get(c) || { name: c, count: 0, responded: 0 };
    cr.count++; cr.responded += isResp; countryMap.set(c, cr);
    for (const role of a.positions || []) {
      const r = roleMap.get(role) || { name: role, count: 0, responded: 0 };
      r.count++; r.responded += isResp; roleMap.set(role, r);
    }
  }
  const sortByCount = (a: InsightRow, b: InsightRow) => b.count - a.count;
  return {
    dispatched: dispatchedApps.length,
    responded,
    positive,
    interview,
    offer,
    responseRate: dispatchedApps.length ? responded / dispatchedApps.length : 0,
    byCountry: [...countryMap.values()].sort(sortByCount).slice(0, 5),
    byRole: [...roleMap.values()].sort(sortByCount).slice(0, 5),
  };
}

