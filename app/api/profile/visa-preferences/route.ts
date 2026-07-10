import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, setVisaPreference } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  return NextResponse.json({ preferences: profile?.visaPreferences ?? {} });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const countryCode = (body?.countryCode || "").toString().toUpperCase().slice(0, 2);
  const visaTypeId: string | null = body?.visaTypeId ? (body.visaTypeId as string).slice(0, 60) : null;
  if (!countryCode) return NextResponse.json({ error: "countryCode required" }, { status: 400 });
  await setVisaPreference(user.id, countryCode, visaTypeId);
  return NextResponse.json({ ok: true, countryCode, visaTypeId });
}
