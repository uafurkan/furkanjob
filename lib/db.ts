// File-backed JSON repository. Dev-grade persistence with a clean interface that mirrors a real
// DB — production swaps this module for Prisma/Postgres (see prisma/schema.prisma) without touching
// callers. No native deps, no binary downloads (works in restricted sandboxes).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Application, Cv, DBShape, EmailAccount, Plan, Profile, Subscription, Usage, User,
} from "./types";

const STORAGE_DIR = path.join(process.cwd(), "storage");
const DB_FILE = path.join(STORAGE_DIR, "db.json");

const EMPTY: DBShape = {
  users: [], emailAccounts: [], profiles: [], cvs: [], applications: [], usage: [], subscriptions: [],
};

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function read(): DBShape {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

function write(db: DBShape) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const now = () => new Date().toISOString();
const id = () => randomUUID();
export const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// ---------- Users ----------
export async function findUserByEmail(email: string): Promise<User | null> {
  return read().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}
export async function findUserById(userId: string): Promise<User | null> {
  return read().users.find((u) => u.id === userId) || null;
}
export async function upsertUserByEmail(data: { email: string; name?: string | null; image?: string | null }): Promise<User> {
  const db = read();
  let u = db.users.find((x) => x.email.toLowerCase() === data.email.toLowerCase());
  if (u) {
    u.name = data.name ?? u.name;
    u.image = data.image ?? u.image;
  } else {
    u = { id: id(), email: data.email, name: data.name ?? null, image: data.image ?? null, plan: "free", stripeCustomerId: null, createdAt: now() };
    db.users.push(u);
  }
  write(db);
  return u;
}
export async function setUserPlan(userId: string, plan: Plan): Promise<void> {
  const db = read();
  const u = db.users.find((x) => x.id === userId);
  if (u) { u.plan = plan; write(db); }
}
export async function setUserStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  const db = read();
  const u = db.users.find((x) => x.id === userId);
  if (u) { u.stripeCustomerId = stripeCustomerId; write(db); }
}
export async function findUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
  return read().users.find((u) => u.stripeCustomerId === stripeCustomerId) || null;
}

// ---------- Email accounts ----------
export async function getDefaultEmailAccount(userId: string): Promise<EmailAccount | null> {
  const accts = read().emailAccounts.filter((a) => a.userId === userId);
  return accts.find((a) => a.isDefault) || accts[0] || null;
}
export async function upsertGoogleAccount(data: {
  userId: string; address: string; accessToken?: string | null; refreshToken?: string | null; expiresAt?: number | null; scope?: string | null;
}): Promise<EmailAccount> {
  const db = read();
  let a = db.emailAccounts.find((x) => x.userId === data.userId && x.address.toLowerCase() === data.address.toLowerCase());
  if (a) {
    a.accessToken = data.accessToken ?? a.accessToken;
    if (data.refreshToken) a.refreshToken = data.refreshToken; // Google only returns it once
    a.expiresAt = data.expiresAt ?? a.expiresAt;
    a.scope = data.scope ?? a.scope;
    a.status = "connected";
  } else {
    a = {
      id: id(), userId: data.userId, provider: "google", address: data.address,
      accessToken: data.accessToken ?? null, refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null, scope: data.scope ?? null, status: "connected",
      isDefault: true, createdAt: now(),
    };
    db.emailAccounts.push(a);
  }
  write(db);
  return a;
}
export async function updateEmailAccountTokens(accountId: string, accessToken: string, expiresAt: number): Promise<void> {
  const db = read();
  const a = db.emailAccounts.find((x) => x.id === accountId);
  if (a) { a.accessToken = accessToken; a.expiresAt = expiresAt; write(db); }
}

// ---------- Profiles ----------
export async function getProfile(userId: string): Promise<Profile | null> {
  return read().profiles.find((p) => p.userId === userId) || null;
}
export async function upsertProfile(userId: string, data: Partial<Profile>): Promise<Profile> {
  const db = read();
  let p = db.profiles.find((x) => x.userId === userId);
  if (p) {
    Object.assign(p, data, { updatedAt: now() });
  } else {
    p = {
      id: id(), userId, fullName: data.fullName || "", contactEmail: data.contactEmail ?? null,
      phone: data.phone ?? null, languages: data.languages ?? [], targetRoles: data.targetRoles ?? [],
      needsVisaSponsorship: data.needsVisaSponsorship ?? true, targetCountries: data.targetCountries ?? [],
      shortBio: data.shortBio ?? null, availability: data.availability ?? null, relocation: data.relocation ?? true,
      tone: data.tone ?? "warm-professional", includeSignature: data.includeSignature ?? false,
      applicationLanguage: data.applicationLanguage ?? "auto",
      defaultCvId: data.defaultCvId ?? null, completedAt: data.completedAt ?? null, updatedAt: now(),
    };
    db.profiles.push(p);
  }
  write(db);
  return p;
}

// ---------- CVs ----------
export async function getDefaultCv(userId: string): Promise<Cv | null> {
  const cvs = read().cvs.filter((c) => c.userId === userId);
  return cvs.find((c) => c.isDefault) || cvs[0] || null;
}
export async function addCv(data: Omit<Cv, "id" | "createdAt" | "isDefault"> & { isDefault?: boolean }): Promise<Cv> {
  const db = read();
  // new default unsets others
  db.cvs.filter((c) => c.userId === data.userId).forEach((c) => (c.isDefault = false));
  const cv: Cv = { ...data, id: id(), isDefault: data.isDefault ?? true, createdAt: now() };
  db.cvs.push(cv);
  write(db);
  return cv;
}

// ---------- Applications ----------
export async function createApplication(data: Omit<Application, "id" | "createdAt">): Promise<Application> {
  const db = read();
  const app: Application = { ...data, id: id(), createdAt: now() };
  db.applications.push(app);
  write(db);
  return app;
}
export async function listApplications(userId: string): Promise<Application[]> {
  return read().applications.filter((a) => a.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- Usage ----------
export async function getUsage(userId: string, period = currentPeriod()): Promise<number> {
  const u = read().usage.find((x) => x.userId === userId && x.period === period);
  return u?.applicationsSent || 0;
}
export async function incrementUsage(userId: string, period = currentPeriod()): Promise<number> {
  const db = read();
  let u = db.usage.find((x) => x.userId === userId && x.period === period);
  if (u) u.applicationsSent += 1;
  else { u = { id: id(), userId, period, applicationsSent: 1 }; db.usage.push(u); }
  write(db);
  return u.applicationsSent;
}

// ---------- Admin aggregates ----------
export async function listUsers(): Promise<User[]> {
  return read().users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function listAllApplications(limit = 100): Promise<Application[]> {
  return read().applications.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
export async function getAdminStats() {
  const db = read();
  const period = currentPeriod();
  const sent = db.applications.filter((a) => a.status === "sent");
  return {
    users: db.users.length,
    proUsers: db.users.filter((u) => u.plan === "pro" || u.plan === "team").length,
    gmailConnected: db.emailAccounts.filter((a) => a.provider === "google").length,
    applications: db.applications.length,
    sent: sent.length,
    failed: db.applications.filter((a) => a.status === "failed").length,
    thisMonthSent: db.usage.filter((u) => u.period === period).reduce((n, u) => n + u.applicationsSent, 0),
  };
}

// ---------- Subscriptions ----------
export async function upsertSubscription(userId: string, data: Partial<Subscription>): Promise<Subscription> {
  const db = read();
  let s = db.subscriptions.find((x) => x.userId === userId);
  if (s) Object.assign(s, data);
  else { s = { id: id(), userId, plan: "free", status: "inactive", stripeSubId: null, currentPeriodEnd: null, ...data }; db.subscriptions.push(s); }
  write(db);
  return s;
}
