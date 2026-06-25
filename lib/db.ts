import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { Application, Cv, Document, EmailAccount, Plan, Profile, Subscription, User } from "./types";

let _sql: NeonQueryFunction<false, false> | null = null;
function sql(...args: Parameters<NeonQueryFunction<false, false>>) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(...args);
}

const now = () => new Date().toISOString();
const id = () => randomUUID();
export const currentPeriod = () => new Date().toISOString().slice(0, 7);

let _schemaInitialized = false;

// ---------- Schema init (lazy, called on first DB access) ----------
async function ensureSchema() {
  if (_schemaInitialized) return;
  try {
    await initSchema();
    _schemaInitialized = true;
  } catch (e) {
    console.warn("Schema init failed (may already exist):", e);
  }
}

async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      image TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      created_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      address TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at BIGINT,
      scope TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, address)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      contact_email TEXT,
      phone TEXT,
      languages TEXT NOT NULL DEFAULT '[]',
      target_roles TEXT NOT NULL DEFAULT '[]',
      needs_visa_sponsorship BOOLEAN NOT NULL DEFAULT TRUE,
      target_countries TEXT NOT NULL DEFAULT '[]',
      short_bio TEXT,
      availability TEXT,
      relocation BOOLEAN NOT NULL DEFAULT TRUE,
      tone TEXT NOT NULL DEFAULT 'warm-professional',
      include_signature BOOLEAN NOT NULL DEFAULT FALSE,
      application_language TEXT NOT NULL DEFAULT 'auto',
      default_cv_id TEXT,
      has_visa BOOLEAN NOT NULL DEFAULT FALSE,
      visa_type TEXT,
      visa_label TEXT,
      visa_countries TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cvs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT,
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL
    )
  `;
  // Migration for existing deployments: store CV bytes in DB (serverless FS is read-only/ephemeral).
  await sql`ALTER TABLE cvs ADD COLUMN IF NOT EXISTS data TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company TEXT,
      country TEXT,
      positions TEXT NOT NULL DEFAULT '[]',
      recipients TEXT NOT NULL DEFAULT '[]',
      email_source TEXT NOT NULL DEFAULT 'text',
      draft_source TEXT NOT NULL DEFAULT 'template',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      provider_msg_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      applications_sent INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, period)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      stripe_sub_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'inactive',
      current_period_end TEXT
    )
  `;
}

// ---------- Row mappers ----------
function mapUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string, email: r.email as string, name: r.name as string | null,
    image: r.image as string | null, plan: r.plan as Plan,
    stripeCustomerId: r.stripe_customer_id as string | null, createdAt: r.created_at as string,
  };
}

function mapAccount(r: Record<string, unknown>): EmailAccount {
  return {
    id: r.id as string, userId: r.user_id as string, provider: r.provider as "google" | "smtp",
    address: r.address as string, accessToken: r.access_token as string | null,
    refreshToken: r.refresh_token as string | null,
    expiresAt: r.expires_at != null ? Number(r.expires_at) : null,
    scope: r.scope as string | null, status: r.status as EmailAccount["status"],
    isDefault: r.is_default as boolean, createdAt: r.created_at as string,
  };
}

function mapProfile(r: Record<string, unknown>): Profile {
  const parseArr = (v: unknown) => {
    if (Array.isArray(v)) return v as string[];
    try { return JSON.parse(v as string) as string[]; } catch { return []; }
  };
  return {
    id: r.id as string, userId: r.user_id as string, fullName: r.full_name as string,
    contactEmail: r.contact_email as string | null, phone: r.phone as string | null,
    languages: parseArr(r.languages), targetRoles: parseArr(r.target_roles),
    needsVisaSponsorship: r.needs_visa_sponsorship as boolean,
    targetCountries: parseArr(r.target_countries),
    shortBio: r.short_bio as string | null, availability: r.availability as string | null,
    relocation: r.relocation as boolean, tone: r.tone as string,
    includeSignature: r.include_signature as boolean,
    applicationLanguage: r.application_language as string,
    defaultCvId: r.default_cv_id as string | null,
    hasVisa: (r.has_visa as boolean | undefined) ?? false,
    visaType: (r.visa_type as string | null | undefined) ?? null,
    visaLabel: (r.visa_label as string | null | undefined) ?? null,
    visaCountries: parseArr(r.visa_countries),
    completedAt: r.completed_at as string | null, updatedAt: r.updated_at as string,
  };
}

function mapCv(r: Record<string, unknown>): Cv {
  return {
    id: r.id as string, userId: r.user_id as string, filename: r.filename as string,
    storageKey: r.storage_key as string, mime: r.mime as string, size: r.size as number,
    isDefault: r.is_default as boolean, createdAt: r.created_at as string,
  };
}

function mapApplication(r: Record<string, unknown>): Application {
  const parseArr = (v: unknown) => {
    if (Array.isArray(v)) return v as string[];
    try { return JSON.parse(v as string) as string[]; } catch { return []; }
  };
  return {
    id: r.id as string, userId: r.user_id as string, company: r.company as string | null,
    country: r.country as string | null, positions: parseArr(r.positions),
    recipients: parseArr(r.recipients),
    emailSource: r.email_source as Application["emailSource"],
    draftSource: r.draft_source as Application["draftSource"],
    subject: r.subject as string, body: r.body as string,
    status: r.status as Application["status"],
    providerMsgId: r.provider_msg_id as string | null, error: r.error as string | null,
    createdAt: r.created_at as string, sentAt: r.sent_at as string | null,
  };
}

// ---------- Users ----------
export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(email)=lower(${email}) LIMIT 1`;
  return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
}
export async function findUserById(userId: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE id=${userId} LIMIT 1`;
  return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
}
export async function upsertUserByEmail(data: { email: string; name?: string | null; image?: string | null }): Promise<User> {
  const rows = await sql`
    INSERT INTO users (id, email, name, image, plan, created_at)
    VALUES (${id()}, ${data.email}, ${data.name ?? null}, ${data.image ?? null}, 'free', ${now()})
    ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, image=EXCLUDED.image
    RETURNING *
  `;
  return mapUser(rows[0] as Record<string, unknown>);
}
export async function setUserPlan(userId: string, plan: Plan): Promise<void> {
  await sql`UPDATE users SET plan=${plan} WHERE id=${userId}`;
}
export async function setUserStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  await sql`UPDATE users SET stripe_customer_id=${stripeCustomerId} WHERE id=${userId}`;
}
export async function findUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE stripe_customer_id=${stripeCustomerId} LIMIT 1`;
  return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
}

// ---------- Email accounts ----------
export async function getDefaultEmailAccount(userId: string): Promise<EmailAccount | null> {
  const rows = await sql`
    SELECT * FROM email_accounts WHERE user_id=${userId} ORDER BY is_default DESC, created_at ASC LIMIT 1
  `;
  return rows[0] ? mapAccount(rows[0] as Record<string, unknown>) : null;
}
export async function upsertGoogleAccount(data: {
  userId: string; address: string; accessToken?: string | null; refreshToken?: string | null;
  expiresAt?: number | null; scope?: string | null;
}): Promise<EmailAccount> {
  const rows = await sql`
    INSERT INTO email_accounts (id, user_id, provider, address, access_token, refresh_token, expires_at, scope, status, is_default, created_at)
    VALUES (${id()}, ${data.userId}, 'google', ${data.address}, ${data.accessToken ?? null},
            ${data.refreshToken ?? null}, ${data.expiresAt ?? null}, ${data.scope ?? null}, 'connected', TRUE, ${now()})
    ON CONFLICT (user_id, address) DO UPDATE SET
      access_token=EXCLUDED.access_token,
      refresh_token=COALESCE(EXCLUDED.refresh_token, email_accounts.refresh_token),
      expires_at=EXCLUDED.expires_at,
      scope=EXCLUDED.scope,
      status='connected'
    RETURNING *
  `;
  return mapAccount(rows[0] as Record<string, unknown>);
}
export async function updateEmailAccountTokens(accountId: string, accessToken: string, expiresAt: number): Promise<void> {
  await sql`UPDATE email_accounts SET access_token=${accessToken}, expires_at=${expiresAt} WHERE id=${accountId}`;
}

// ---------- Profiles ----------
export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await sql`SELECT * FROM profiles WHERE user_id=${userId} LIMIT 1`;
  return rows[0] ? mapProfile(rows[0] as Record<string, unknown>) : null;
}
export async function upsertProfile(userId: string, data: Partial<Profile>): Promise<Profile> {
  const arrStr = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : []);
  // Self-contained, idempotent migration for held-visa columns (initSchema isn't wired at runtime).
  await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_visa BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visa_type TEXT`;
  await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visa_label TEXT`;
  await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visa_countries TEXT NOT NULL DEFAULT '[]'`;
  const rows = await sql`
    INSERT INTO profiles (id, user_id, full_name, contact_email, phone, languages, target_roles,
      needs_visa_sponsorship, target_countries, short_bio, availability, relocation, tone,
      include_signature, application_language, default_cv_id,
      has_visa, visa_type, visa_label, visa_countries, completed_at, updated_at)
    VALUES (${id()}, ${userId}, ${data.fullName ?? ""}, ${data.contactEmail ?? null},
      ${data.phone ?? null}, ${arrStr(data.languages)}, ${arrStr(data.targetRoles)},
      ${data.needsVisaSponsorship ?? true}, ${arrStr(data.targetCountries)},
      ${data.shortBio ?? null}, ${data.availability ?? null}, ${data.relocation ?? true},
      ${data.tone ?? "warm-professional"}, ${data.includeSignature ?? false},
      ${data.applicationLanguage ?? "auto"}, ${data.defaultCvId ?? null},
      ${data.hasVisa ?? false}, ${data.visaType ?? null}, ${data.visaLabel ?? null},
      ${arrStr(data.visaCountries)}, ${data.completedAt ?? null}, ${now()})
    ON CONFLICT (user_id) DO UPDATE SET
      full_name=EXCLUDED.full_name, contact_email=EXCLUDED.contact_email,
      phone=EXCLUDED.phone, languages=EXCLUDED.languages, target_roles=EXCLUDED.target_roles,
      needs_visa_sponsorship=EXCLUDED.needs_visa_sponsorship, target_countries=EXCLUDED.target_countries,
      short_bio=EXCLUDED.short_bio, availability=EXCLUDED.availability, relocation=EXCLUDED.relocation,
      tone=EXCLUDED.tone, include_signature=EXCLUDED.include_signature,
      application_language=EXCLUDED.application_language, default_cv_id=EXCLUDED.default_cv_id,
      has_visa=EXCLUDED.has_visa, visa_type=EXCLUDED.visa_type, visa_label=EXCLUDED.visa_label,
      visa_countries=EXCLUDED.visa_countries,
      completed_at=EXCLUDED.completed_at, updated_at=EXCLUDED.updated_at
    RETURNING *
  `;
  return mapProfile(rows[0] as Record<string, unknown>);
}

// ---------- CVs ----------
export async function getDefaultCv(userId: string): Promise<Cv | null> {
  const rows = await sql`
    SELECT * FROM cvs WHERE user_id=${userId} ORDER BY is_default DESC, created_at DESC LIMIT 1
  `;
  return rows[0] ? mapCv(rows[0] as Record<string, unknown>) : null;
}
export async function addCv(
  data: Omit<Cv, "id" | "createdAt" | "isDefault"> & { isDefault?: boolean; dataB64?: string }
): Promise<Cv> {
  // Self-contained, idempotent migration: guarantees the cvs.data column exists
  // (ensureSchema is never wired up at runtime, so the upload path runs it here).
  await sql`ALTER TABLE cvs ADD COLUMN IF NOT EXISTS data TEXT`;
  await sql`UPDATE cvs SET is_default=FALSE WHERE user_id=${data.userId}`;
  const rows = await sql`
    INSERT INTO cvs (id, user_id, filename, storage_key, mime, size, data, is_default, created_at)
    VALUES (${id()}, ${data.userId}, ${data.filename}, ${data.storageKey}, ${data.mime}, ${data.size}, ${data.dataB64 ?? null}, TRUE, ${now()})
    RETURNING *
  `;
  return mapCv(rows[0] as Record<string, unknown>);
}
// All of a user's CVs (newest/default first), without the bytes — for the CV manager.
export async function listCvs(userId: string): Promise<Cv[]> {
  const rows = await sql`
    SELECT id, user_id, filename, storage_key, mime, size, is_default, created_at
    FROM cvs WHERE user_id=${userId} ORDER BY is_default DESC, created_at DESC
  `;
  return rows.map((r) => mapCv(r as Record<string, unknown>));
}
export async function getCvForUser(cvId: string, userId: string): Promise<Cv | null> {
  const rows = await sql`SELECT * FROM cvs WHERE id=${cvId} AND user_id=${userId} LIMIT 1`;
  return rows[0] ? mapCv(rows[0] as Record<string, unknown>) : null;
}
export async function setDefaultCv(cvId: string, userId: string): Promise<void> {
  await sql`UPDATE cvs SET is_default=FALSE WHERE user_id=${userId}`;
  await sql`UPDATE cvs SET is_default=TRUE WHERE id=${cvId} AND user_id=${userId}`;
}
export async function deleteCv(cvId: string, userId: string): Promise<void> {
  const wasDefault = await sql`SELECT is_default FROM cvs WHERE id=${cvId} AND user_id=${userId} LIMIT 1`;
  await sql`DELETE FROM cvs WHERE id=${cvId} AND user_id=${userId}`;
  // Promote the most recent remaining CV to default if we removed the default one.
  if (wasDefault[0]?.is_default) {
    await sql`UPDATE cvs SET is_default=TRUE WHERE id=(
      SELECT id FROM cvs WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 1
    )`;
  }
}
// Returns the raw CV bytes from the DB (null if stored only on disk / legacy).
export async function getCvData(cvId: string): Promise<Buffer | null> {
  try {
    const rows = await sql`SELECT data FROM cvs WHERE id=${cvId} LIMIT 1`;
    const b64 = rows[0]?.data as string | null | undefined;
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch {
    // `data` column may not exist on an older schema — caller falls back to disk.
    return null;
  }
}

// ---------- Documents (extra attachments: visa proof, certificates, diplomas…) ----------
async function ensureDocumentsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    )
  `;
}
function mapDocument(r: Record<string, unknown>): Document {
  return {
    id: r.id as string, userId: r.user_id as string, type: r.type as Document["type"],
    filename: r.filename as string, mime: r.mime as string, size: r.size as number,
    createdAt: r.created_at as string,
  };
}
export async function addDocument(
  data: { userId: string; type: Document["type"]; filename: string; mime: string; size: number; dataB64?: string; replace?: boolean }
): Promise<Document> {
  await ensureDocumentsTable();
  // `replace` keeps a single document of this type (used for the visa proof); otherwise the
  // library allows multiple (e.g. several certificates).
  if (data.replace) await sql`DELETE FROM documents WHERE user_id=${data.userId} AND type=${data.type}`;
  const rows = await sql`
    INSERT INTO documents (id, user_id, type, filename, mime, size, data, created_at)
    VALUES (${id()}, ${data.userId}, ${data.type}, ${data.filename}, ${data.mime}, ${data.size}, ${data.dataB64 ?? null}, ${now()})
    RETURNING *
  `;
  return mapDocument(rows[0] as Record<string, unknown>);
}
export async function listDocuments(userId: string): Promise<Document[]> {
  try {
    await ensureDocumentsTable();
    const rows = await sql`SELECT id, user_id, type, filename, mime, size, created_at FROM documents WHERE user_id=${userId} ORDER BY created_at DESC`;
    return rows.map((r) => mapDocument(r as Record<string, unknown>));
  } catch {
    return [];
  }
}
export async function getDocumentData(docId: string, userId: string): Promise<{ doc: Document; bytes: Buffer } | null> {
  try {
    const rows = await sql`SELECT * FROM documents WHERE id=${docId} AND user_id=${userId} LIMIT 1`;
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    const b64 = r.data as string | null | undefined;
    if (!b64) return null;
    return { doc: mapDocument(r), bytes: Buffer.from(b64, "base64") };
  } catch {
    return null;
  }
}
export async function deleteDocument(docId: string, userId: string): Promise<void> {
  await sql`DELETE FROM documents WHERE id=${docId} AND user_id=${userId}`;
}
// Fetch several owned documents (with bytes) for attaching to an email.
export async function getDocumentsForAttach(ids: string[], userId: string): Promise<{ doc: Document; bytes: Buffer }[]> {
  if (!ids.length) return [];
  const out: { doc: Document; bytes: Buffer }[] = [];
  for (const docId of ids.slice(0, 8)) {
    const found = await getDocumentData(docId, userId);
    if (found) out.push(found);
  }
  return out;
}

// ---------- Rate limiting (fixed-window, DB-backed so it works on serverless) ----------
async function ensureRateTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL
    )
  `;
}
// Increments the bucket for (userId, action) and returns the new count within the window.
export async function hitRateLimit(userId: string, action: string, windowSec: number): Promise<number> {
  try {
    await ensureRateTable();
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const key = `${userId}:${action}:${bucket}`;
    const expires = (bucket + 1) * windowSec;
    const rows = await sql`
      INSERT INTO rate_limits (key, count, expires_at) VALUES (${key}, 1, ${expires})
      ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    // Opportunistic cleanup of expired buckets (cheap, keeps the table tiny).
    await sql`DELETE FROM rate_limits WHERE expires_at < ${Math.floor(Date.now() / 1000)}`;
    return rows[0].count as number;
  } catch {
    return 0; // never block the product on a limiter failure
  }
}

// ---------- Account data (GDPR/KVKK: export + delete) ----------
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [user, profile, cvs, apps, docs, usageRows, sub] = await Promise.all([
    findUserById(userId),
    getProfile(userId),
    listCvs(userId),
    listApplications(userId),
    listDocuments(userId),
    sql`SELECT period, applications_sent FROM usage WHERE user_id=${userId} ORDER BY period DESC`,
    sql`SELECT plan, status, current_period_end FROM subscriptions WHERE user_id=${userId} LIMIT 1`,
  ]);
  return {
    exportedAt: now(),
    user,
    profile,
    cvs: cvs.map((c) => ({ filename: c.filename, size: c.size, isDefault: c.isDefault, createdAt: c.createdAt })),
    documents: docs.map((d) => ({ type: d.type, filename: d.filename, size: d.size, createdAt: d.createdAt })),
    applications: apps,
    usage: usageRows,
    subscription: sub[0] ?? null,
  };
}
export async function deleteUserData(userId: string): Promise<void> {
  await Promise.all([
    sql`DELETE FROM applications WHERE user_id=${userId}`,
    sql`DELETE FROM cvs WHERE user_id=${userId}`,
    sql`DELETE FROM documents WHERE user_id=${userId}`,
    sql`DELETE FROM usage WHERE user_id=${userId}`,
    sql`DELETE FROM profiles WHERE user_id=${userId}`,
    sql`DELETE FROM email_accounts WHERE user_id=${userId}`,
    sql`DELETE FROM subscriptions WHERE user_id=${userId}`,
  ]);
  await sql`DELETE FROM users WHERE id=${userId}`;
}

// ---------- Applications ----------
export async function createApplication(data: Omit<Application, "id" | "createdAt">): Promise<Application> {
  const rows = await sql`
    INSERT INTO applications (id, user_id, company, country, positions, recipients, email_source,
      draft_source, subject, body, status, provider_msg_id, error, created_at, sent_at)
    VALUES (${id()}, ${data.userId}, ${data.company ?? null}, ${data.country ?? null},
      ${JSON.stringify(data.positions)}, ${JSON.stringify(data.recipients)},
      ${data.emailSource}, ${data.draftSource}, ${data.subject}, ${data.body},
      ${data.status}, ${data.providerMsgId ?? null}, ${data.error ?? null}, ${now()}, ${data.sentAt ?? null})
    RETURNING *
  `;
  return mapApplication(rows[0] as Record<string, unknown>);
}
export async function listApplications(userId: string): Promise<Application[]> {
  const rows = await sql`SELECT * FROM applications WHERE user_id=${userId} ORDER BY created_at DESC`;
  return rows.map((r) => mapApplication(r as Record<string, unknown>));
}

// ---------- Usage ----------
export async function getUsage(userId: string, period = currentPeriod()): Promise<number> {
  const rows = await sql`SELECT applications_sent FROM usage WHERE user_id=${userId} AND period=${period} LIMIT 1`;
  return rows[0] ? (rows[0].applications_sent as number) : 0;
}
export async function incrementUsage(userId: string, period = currentPeriod()): Promise<number> {
  const rows = await sql`
    INSERT INTO usage (id, user_id, period, applications_sent) VALUES (${id()}, ${userId}, ${period}, 1)
    ON CONFLICT (user_id, period) DO UPDATE SET applications_sent=usage.applications_sent+1
    RETURNING applications_sent
  `;
  return rows[0].applications_sent as number;
}

// ---------- Admin aggregates ----------
export async function listUsers(): Promise<User[]> {
  const rows = await sql`SELECT * FROM users ORDER BY created_at DESC`;
  return rows.map((r) => mapUser(r as Record<string, unknown>));
}
export async function listAllApplications(limit = 100): Promise<Application[]> {
  const rows = await sql`SELECT * FROM applications ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => mapApplication(r as Record<string, unknown>));
}
export async function getAdminStats() {
  const period = currentPeriod();
  const [[users], [apps], [usage], [accounts]] = await Promise.all([
    sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE plan IN ('pro','team')) AS pro FROM users`,
    sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='sent') AS sent, COUNT(*) FILTER (WHERE status='failed') AS failed FROM applications`,
    sql`SELECT COALESCE(SUM(applications_sent),0) AS month_sent FROM usage WHERE period=${period}`,
    sql`SELECT COUNT(*) AS gmail FROM email_accounts WHERE provider='google'`,
  ]);
  return {
    users: Number(users.total),
    proUsers: Number(users.pro),
    gmailConnected: Number(accounts.gmail),
    applications: Number(apps.total),
    sent: Number(apps.sent),
    failed: Number(apps.failed),
    thisMonthSent: Number(usage.month_sent),
  };
}

// ---------- Subscriptions ----------
export async function upsertSubscription(userId: string, data: Partial<Subscription>): Promise<Subscription> {
  const rows = await sql`
    INSERT INTO subscriptions (id, user_id, stripe_sub_id, plan, status, current_period_end)
    VALUES (${id()}, ${userId}, ${data.stripeSubId ?? null}, ${data.plan ?? "free"}, ${data.status ?? "inactive"}, ${data.currentPeriodEnd ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_sub_id=EXCLUDED.stripe_sub_id, plan=EXCLUDED.plan,
      status=EXCLUDED.status, current_period_end=EXCLUDED.current_period_end
    RETURNING *
  `;
  const r = rows[0] as Record<string, unknown>;
  return {
    id: r.id as string, userId: r.user_id as string, stripeSubId: r.stripe_sub_id as string | null,
    plan: r.plan as Plan, status: r.status as string, currentPeriodEnd: r.current_period_end as string | null,
  };
}
