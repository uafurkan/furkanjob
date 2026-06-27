import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/db";
import { aiTier } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";
import { APP_LANGS, type AppLang } from "@/lib/engine/template";
import { aiRewriteCoverLetter } from "@/lib/engine/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(user.id, "generate");
    if (!rl.ok)
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );

    const data = await req.json().catch(() => ({}));
    const currentCoverLetter = String(data?.currentCoverLetter || "").trim();
    const jobText = String(data?.jobText || "").trim();
    const company = String(data?.company || "").trim();
    const positions: string[] = Array.isArray(data?.positions) ? data.positions : [];
    const langCode = String(data?.language || "en");

    if (!currentCoverLetter) {
      return NextResponse.json({ error: "Cover letter is empty." }, { status: 400 });
    }

    const profile = await getProfile(user.id);
    const tier = aiTier(user.plan);

    const validLangs = APP_LANGS.map((l) => l.code) as string[];
    const lang: AppLang = (validLangs.includes(langCode) ? langCode : "en") as AppLang;

    const result = await aiRewriteCoverLetter({
      currentCoverLetter,
      jobText,
      company,
      positions,
      applicantName: profile?.fullName || user.name || undefined,
      applicantBio: profile?.shortBio || undefined,
      applicantLanguages: profile?.languages || [],
      needsVisaSponsorship: profile?.needsVisaSponsorship || false,
      openToRelocation: profile?.relocation || false,
      lang,
      tier,
    });

    if (!result) {
      return NextResponse.json({ error: "AI failed to generate a rewrite." }, { status: 503 });
    }

    return NextResponse.json({ body: result });
  } catch (e: any) {
    await reportError(e, { route: "rewrite-cover-letter" });
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
