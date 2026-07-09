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

// ---------- Duplicate-application detection ----------
// Public webmail domains never identify a specific business, so a shared domain there is
// meaningless as a "same company" signal — only a company's own domain counts.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com",
  "hotmail.co.uk", "live.com", "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me",
  "gmx.com", "gmx.de", "mail.com", "yandex.com", "zoho.com",
]);

// ISP-hosted mailboxes are just as shared as webmail: thousands of unrelated small businesses
// run on hotelname@xtra.co.nz, cafe@bigpond.com, shop@btinternet.com… A matching domain there
// says NOTHING about the business — only the FULL address identifies it. Cores mirror the
// ISP_DOMAINS provider list in lib/engine/detect.ts (kept local so client pages importing this
// module don't pull the whole detection engine into their bundle).
const ISP_DOMAIN_CORE_RE =
  /^(xtra|spark|clear|slingshot|orcon|snap|woosh|paradise|callplus|telecom|vodafone|optus|bigpond|internode|iinet|aapt|tpg|dodo|telstra|singtel|starhub|maxis|celcom|digi|bsnl|jio|airtel|mynet|superonline|ttmail|turknet|kablonet|shaw|rogers|telus|bell|sympatico|videotron|cogeco|eastlink|sasktel|btinternet|btconnect|virginmedia|talktalk|blueyonder|ntlworld|plusnet|t-online|freenet|alice|libero|virgilio|wanadoo|orange|sfr|neuf|laposte|cox|comcast|charter|spectrum|roadrunner|twc|verizon|att|bellsouth|sbcglobal|earthlink|windstream|suddenlink|optonline|netzero|juno|sky|rediffmail|yandex|farmside|actrix|westnet|adam|netspace|chariot|tassie|picknowl|ozemail)$/i;

// True when a recipient domain is a shared mailbox provider (webmail or ISP) rather than the
// business's own domain — i.e. it must NOT be used for domain-level "same company" matching.
export function isSharedInboxDomain(domain: string): boolean {
  if (!domain) return true;
  if (FREE_EMAIL_DOMAINS.has(domain)) return true;
  const core = domain.split(".")[0];
  return ISP_DOMAIN_CORE_RE.test(core);
}

const COMPANY_SUFFIXES = /\b(ltd|limited|llc|l l c|inc|incorporated|plc|corp|corporation|co|company|pty|gmbh|srl|s r l|sa|s a|nv|ag|group|holdings)\b\.?/gi;

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'’&]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export type DuplicateCandidate = { id: string; company?: string | null; recipients: string[]; createdAt: string };

// Smarter than a raw company-string/email match: also recognizes the same business by its
// email domain (info@ vs hr@ vs careers@ at the same company all count) and by company name
// once legal suffixes ("Ltd", "Group", ...) and punctuation are normalized away.
export function findDuplicateApplication<T extends DuplicateCandidate>(
  prior: T[],
  current: { company?: string | null; emails: string[] }
): T | null {
  const emailSet = new Set(current.emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  // Shared webmail/ISP domains are excluded here — for those, only the exact-address match
  // above can identify the business (two different @xtra.co.nz mailboxes are two businesses).
  const domainSet = new Set(
    [...emailSet].map(emailDomain).filter((d) => d && !isSharedInboxDomain(d))
  );
  const companyKey = normalizeCompanyName(current.company);

  for (const a of prior) {
    const aEmails = a.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (aEmails.some((e) => emailSet.has(e))) return a;
    if (domainSet.size && aEmails.some((e) => domainSet.has(emailDomain(e)))) return a;
    if (companyKey && companyKey === normalizeCompanyName(a.company)) return a;
  }
  return null;
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
    const c = (a.country || "").trim();
    if (c) {
      const cr = countryMap.get(c) || { name: c, count: 0, responded: 0 };
      cr.count++; cr.responded += isResp; countryMap.set(c, cr);
    }
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

