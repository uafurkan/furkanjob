import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { Application, Cv, EmailAccount, Plan, Profile, Subscription, User } from "./types";

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
      completed_at TEXT,
      updated_at TEXT NOT NULL
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
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL
    )
  `;
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
  const rows = await sql`
    INSERT INTO profiles (id, user_id, full_name, contact_email, phone, languages, target_roles,
      needs_visa_sponsorship, target_countries, short_bio, availability, relocation, tone,
      include_signature, application_language, default_cv_id, completed_at, updated_at)
    VALUES (${id()}, ${userId}, ${data.fullName ?? ""}, ${data.contactEmail ?? null},
      ${data.phone ?? null}, ${arrStr(data.languages)}, ${arrStr(data.targetRoles)},
      ${data.needsVisaSponsorship ?? true}, ${arrStr(data.targetCountries)},
      ${data.shortBio ?? null}, ${data.availability ?? null}, ${data.relocation ?? true},
      ${data.tone ?? "warm-professional"}, ${data.includeSignature ?? false},
      ${data.applicationLanguage ?? "auto"}, ${data.defaultCvId ?? null},
      ${data.completedAt ?? null}, ${now()})
    ON CONFLICT (user_id) DO UPDATE SET
      full_name=EXCLUDED.full_name, contact_email=EXCLUDED.contact_email,
      phone=EXCLUDED.phone, languages=EXCLUDED.languages, target_roles=EXCLUDED.target_roles,
      needs_visa_sponsorship=EXCLUDED.needs_visa_sponsorship, target_countries=EXCLUDED.target_countries,
      short_bio=EXCLUDED.short_bio, availability=EXCLUDED.availability, relocation=EXCLUDED.relocation,
      tone=EXCLUDED.tone, include_signature=EXCLUDED.include_signature,
      application_language=EXCLUDED.application_language, default_cv_id=EXCLUDED.default_cv_id,
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
export async function addCv(data: Omit<Cv, "id" | "createdAt" | "isDefault"> & { isDefault?: boolean }): Promise<Cv> {
  await sql`UPDATE cvs SET is_default=FALSE WHERE user_id=${data.userId}`;
  const rows = await sql`
    INSERT INTO cvs (id, user_id, filename, storage_key, mime, size, is_default, created_at)
    VALUES (${id()}, ${data.userId}, ${data.filename}, ${data.storageKey}, ${data.mime}, ${data.size}, TRUE, ${now()})
    RETURNING *
  `;
  return mapCv(rows[0] as Record<string, unknown>);
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
