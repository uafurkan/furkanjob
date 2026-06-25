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
