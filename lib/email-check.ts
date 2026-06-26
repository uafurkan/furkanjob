// Client-safe recipient sanity check. Catches the common typos that silently
// turn a real application into a bounce: misspelled providers, wrong TLDs,
// missing "@". Pure functions only — no network, no guessing of real addresses.

const BASIC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common public-provider misspellings → correct domain.
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "iclould.com": "icloud.com",
  "icloud.con": "icloud.com",
  "live.con": "live.com",
};

// Bare TLD slips that apply to ANY domain, not just public providers.
const TLD_TYPOS: { bad: RegExp; good: string }[] = [
  { bad: /\.con$/i, good: ".com" },
  { bad: /\.cmo$/i, good: ".com" },
  { bad: /\.ocm$/i, good: ".com" },
  { bad: /\.vom$/i, good: ".com" },
  { bad: /\.xom$/i, good: ".com" },
  { bad: /\.comm$/i, good: ".com" },
];

export type EmailIssue =
  | { kind: "invalid"; value: string }
  | { kind: "typo"; value: string; suggestion: string };

// Check one address. Returns null when it looks fine.
function checkOne(raw: string): EmailIssue | null {
  const value = raw.trim();
  if (!value) return null;
  if (!BASIC_RE.test(value)) return { kind: "invalid", value };

  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();

  const known = DOMAIN_TYPOS[domain];
  if (known) return { kind: "typo", value, suggestion: `${local}@${known}` };

  for (const { bad, good } of TLD_TYPOS) {
    if (bad.test(domain)) return { kind: "typo", value, suggestion: `${local}@${domain.replace(bad, good)}` };
  }
  return null;
}

// Check a "to" field that may hold several comma/semicolon-separated addresses.
// Returns the first issue found (one nudge at a time keeps the UI calm).
export function checkRecipients(field: string): EmailIssue | null {
  const parts = field.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const issue = checkOne(p);
    if (issue) return issue;
  }
  return null;
}

// Apply a suggested fix to the field, replacing only the offending address.
export function applyFix(field: string, value: string, suggestion: string): string {
  const sep = field.includes(";") ? ";" : ",";
  return field
    .split(/[,;]/)
    .map((s) => (s.trim() === value ? s.replace(value, suggestion) : s))
    .join(`${sep} `)
    .replace(/\s+/g, " ")
    .trim();
}
