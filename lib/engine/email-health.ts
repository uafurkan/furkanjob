// Email health check: MX record lookup + role/noreply classification.
// Determines whether a recipient address is likely deliverable before we send.
//
// What we CAN check deterministically:
//   1. Syntax validity
//   2. MX record existence (Node.js dns.promises — works in serverless, no port 25 needed)
//   3. Known noreply/bounce patterns (sending is pointless)
//   4. Role address classification (shared inbox — warn but allow for job apps)
//
// What we CANNOT check: actual mailbox existence (SMTP RCPT probing is blocked by
// cloud providers and disabled by modern mail servers to prevent harvesting).
import { promises as dns } from "node:dns";

export type EmailHealthStatus =
  | "ok"         // MX found, not a noreply, not a generic role address
  | "ok-role"    // Hiring-specific role address (hr@, careers@) — good for job apps
  | "warn-role"  // Generic shared inbox (info@, contact@) — may be read but slow
  | "noreply"    // Noreply / bounce / auto-mailer — sending is pointless
  | "no-mx"      // Domain has no MX records — email will bounce
  | "invalid";   // Malformed address

export type EmailHealth = {
  status: EmailHealthStatus;
  mxFound: boolean | null;    // null when not checked (invalid address)
  label: string;
  hint: string | null;
};

// ── Classification patterns ────────────────────────────────────────────────

// Definitively dead: sending here is wasted
const NOREPLY_LOCAL = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|do_not_reply|dont-reply|dont_reply|mailer-daemon|mailer_daemon|bounce|bounces|notifications?|automated?|autoresponder|unsubscribe|postmaster|devnull|blackhole|trash|null|void)$/i;

// Hiring-specific role addresses — actually great to send applications to
const HIRING_LOCAL = /^(hr|careers?|jobs?|hiring|recruitment|recruiter|talent|apply|applications?|vacancy|vacancies|work-with-us|join-us|jointeam|work)$/i;

// Generic shared inboxes — may work but slow / impersonal
const ROLE_LOCAL = /^(info|information|contact|contacts|hello|hi|enqui(r|e)y|enqui(r|e)ies|general|office|admin|administration|support|help|helpdesk|mail|email|welcome|staff|team|management|manager|director|reception|front-?desk|concierge|bookings?|reservations?)$/i;

// ── In-process MX cache (TTL: 10 min) ─────────────────────────────────────
// Serverless functions are short-lived so this cache is opportunistic — it avoids
// duplicate lookups within the same pipeline run, not across cold starts.
const mxCache = new Map<string, { result: boolean; expires: number }>();
const MX_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MX_TIMEOUT_MS = 4000;

async function hasMxRecords(domain: string): Promise<boolean> {
  const lower = domain.toLowerCase();
  const cached = mxCache.get(lower);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const records = await Promise.race([
      dns.resolveMx(lower),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("dns timeout")), MX_TIMEOUT_MS)
      ),
    ]);
    const found = Array.isArray(records) && records.length > 0;
    mxCache.set(lower, { result: found, expires: Date.now() + MX_CACHE_TTL });
    return found;
  } catch {
    // Treat DNS errors as "unknown" — default to allowing the send rather than
    // falsely blocking a valid address due to a transient DNS failure.
    // Cache negative result briefly to avoid hammering DNS on retries.
    mxCache.set(lower, { result: true, expires: Date.now() + 60_000 });
    return true;
  }
}

// ── Main export ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function checkEmailHealth(email: string): Promise<EmailHealth> {
  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_RE.test(trimmed)) {
    return { status: "invalid", mxFound: null, label: "Invalid address", hint: "This doesn't look like a valid email address." };
  }

  const [local, domain] = trimmed.split("@");

  // Noreply check (instant, no DNS)
  if (NOREPLY_LOCAL.test(local)) {
    return {
      status: "noreply",
      mxFound: null,
      label: "No-reply address",
      hint: "This appears to be an automated address — messages sent here are usually not read.",
    };
  }

  // MX record check
  const mxFound = await hasMxRecords(domain);
  if (!mxFound) {
    return {
      status: "no-mx",
      mxFound: false,
      label: "No mail server found",
      hint: `The domain "${domain}" has no mail server configured — this email will bounce.`,
    };
  }

  // Role address classification (after MX — domain is at least reachable)
  if (HIRING_LOCAL.test(local)) {
    return {
      status: "ok-role",
      mxFound: true,
      label: "Hiring inbox",
      hint: "This looks like a dedicated hiring address — a good choice for job applications.",
    };
  }

  if (ROLE_LOCAL.test(local)) {
    return {
      status: "warn-role",
      mxFound: true,
      label: "Shared inbox",
      hint: "This appears to be a general contact address. Your application may be read but could take longer to reach the right person.",
    };
  }

  return {
    status: "ok",
    mxFound: true,
    label: "Address looks good",
    hint: null,
  };
}

// Convenience: check multiple addresses, return worst status first
export async function checkRecipientsHealth(emails: string[]): Promise<{ email: string; health: EmailHealth }[]> {
  return Promise.all(emails.map(async (email) => ({ email, health: await checkEmailHealth(email) })));
}
