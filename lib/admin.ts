// Admin access is controlled entirely via environment variables — no email addresses
// are ever hardcoded in source. Set in .env (gitignored, never committed):
//
//   ADMIN_EMAILS=alice@example.com,bob@example.com
//   ADMIN_DOMAINS=yourcompany.com   (every @yourcompany.com address becomes admin)
//
// Admin status is only granted for Google OAuth sessions.
// logins are explicitly excluded regardless of email address.

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function adminDomains(): string[] {
  return (process.env.ADMIN_DOMAINS || "")
    .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

/** True only for Google OAuth sessions whose email/domain is in the env config. */
export function isAdmin(
  email: string | null | undefined,
  provider: string | null | undefined
): boolean {
  if (!email || provider !== "google") return false;
  const lc = email.toLowerCase();
  if (adminEmails().includes(lc)) return true;
  const domain = lc.split("@")[1];
  return Boolean(domain && adminDomains().includes(domain));
}

/** Legacy: plain email check (used by /admin page guard). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return isAdmin(email, "google"); // domain check without provider is fine for page guard
}
