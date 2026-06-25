import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, upsertProfile } from "@/lib/db";
import { sanitizeCountryCodes } from "@/lib/engine/visa";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const asArray = (v: any): string[] =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];

  const hasVisa = Boolean(b.hasVisa);
  const visaCountries = hasVisa ? sanitizeCountryCodes(b.visaCountries) : [];

  const profile = await upsertProfile(user.id, {
    fullName: (b.fullName || user.name || "").toString().trim(),
    contactEmail: b.contactEmail?.toString().trim() || user.email,
    phone: b.phone?.toString().trim() || null,
    languages: asArray(b.languages),
    targetRoles: asArray(b.targetRoles),
    needsVisaSponsorship: Boolean(b.needsVisaSponsorship),
    targetCountries: asArray(b.targetCountries),
    shortBio: b.shortBio?.toString().trim() || null,
    availability: b.availability?.toString().trim() || null,
    relocation: b.relocation === undefined ? true : Boolean(b.relocation),
    tone: b.tone?.toString() || "warm-professional",
    includeSignature: Boolean(b.includeSignature),
    digestOptOut: Boolean(b.digestOptOut),
    applicationLanguage: b.applicationLanguage?.toString() || "auto",
    hasVisa,
    visaType: hasVisa ? (b.visaType?.toString() || null) : null,
    visaLabel: hasVisa ? (b.visaLabel?.toString().trim().slice(0, 80) || null) : null,
    visaCountries,
    completedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, profile });
}
