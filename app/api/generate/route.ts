import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, getUsage, getDefaultCv } from "@/lib/db";
import { toEngineProfile } from "@/lib/profile-adapter";
import { runPipeline } from "@/lib/engine/pipeline";
import { aiTier, isOverLimit, planInfo } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    return await handleGenerate(req);
  } catch (e: any) {
    await reportError(e, { route: "generate" });
    return NextResponse.json({ error: e?.message || "Sunucu hatası" }, { status: 500 });
  }
}

async function handleGenerate(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, "generate");
  if (!rl.ok) return NextResponse.json({ error: "Çok fazla istek. Biraz bekleyin." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const body = await req.json().catch(() => ({}));
  const text: string = (body?.text || "").toString();
  if (!text.trim()) return NextResponse.json({ error: "İçerik boş." }, { status: 400 });

  const used = await getUsage(user.id);
  const overLimit = isOverLimit(user.plan, used);

  const profile = await getProfile(user.id);
  const engineProfile = toEngineProfile(profile, user);

  const result = await runPipeline({
    text,
    profile: engineProfile,
    tier: aiTier(user.plan),
    searchWeb: true,
    language: body?.language || undefined,
    hints: {
      company: body?.company || undefined,
      country: body?.country || undefined,
      positions: Array.isArray(body?.positions) ? body.positions : undefined,
    },
  });

  const cv = await getDefaultCv(user.id);

  return NextResponse.json({
    company: result.analysis.company,
    country: result.analysis.country.name,
    positions: result.analysis.positions,
    emails: result.emails,
    emailSource: result.emailSource,
    subject: result.draft.subject,
    body: result.draft.body,
    draftSource: result.draftSource,
    language: result.language,
    countryCode: result.analysis.country.code,
    visaCovered: result.visaCovered,
    visaLabel: result.visaLabel,
    cv: cv ? { filename: cv.filename } : null,
    overLimit,
    plan: user.plan,
    limit: planInfo(user.plan).monthlyLimit === Infinity ? null : planInfo(user.plan).monthlyLimit,
    used,
  });
}
