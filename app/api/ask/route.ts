import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/db";
import { toEngineProfile } from "@/lib/profile-adapter";
import { enrichProfileWithDocuments } from "@/lib/profile-context";
import { aiAsk } from "@/lib/engine/ai";
import { APP_LANGS, type AppLang } from "@/lib/engine/template";
import { VALID_ORG_TYPES, type OrgType } from "@/lib/engine/professions";
import { aiTier } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(user.id, "generate");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const data = await req.json().catch(() => ({}));
    const body = String(data?.body || "").trim();
    const subject = typeof data?.subject === "string" ? data.subject.trim() : undefined;
    const coverLetter = typeof data?.coverLetter === "string" ? data.coverLetter.trim() : undefined;
    const jobText = String(data?.jobText || "").trim();
    const question = String(data?.question || "").trim();
    const company = typeof data?.company === "string" ? data.company : undefined;
    const countryName = typeof data?.countryName === "string" ? data.countryName : undefined;
    const orgType = typeof data?.orgType === "string" && (VALID_ORG_TYPES as string[]).includes(data.orgType) ? (data.orgType as OrgType) : undefined;
    const applyFor = Array.isArray(data?.applyFor) ? data.applyFor.filter((x: unknown): x is string => typeof x === "string") : undefined;

    if (!body) return NextResponse.json({ error: "Email body is empty." }, { status: 400 });
    if (!question) return NextResponse.json({ error: "Question is empty." }, { status: 400 });

    const validLangs = APP_LANGS.map((l) => l.code) as string[];
    const lang: AppLang = (validLangs.includes(data?.language) ? data.language : "en") as AppLang;

    // Fetch the user's REAL saved profile server-side (never trust client-sent profile facts) so
    // the coach chat is always grounded in their actual target roles, countries, visa status, bio —
    // it never drifts from who this specific user is, turn after turn.
    const profile = await getProfile(user.id);
    let engineProfile = toEngineProfile(profile, user);
    engineProfile = await enrichProfileWithDocuments(user.id, engineProfile);

    const result = await aiAsk({
      body,
      subject: subject || undefined,
      coverLetter: coverLetter || undefined,
      jobText,
      question,
      company,
      orgType,
      countryName,
      applyFor,
      profile: engineProfile,
      lang,
      tier: aiTier(user.plan),
    });

    if (!result) return NextResponse.json({ error: "AI failed to respond." }, { status: 503 });

    return NextResponse.json(result);
  } catch (e: any) {
    await reportError(e, { route: "ask" });
    return NextResponse.json({ error: e?.message || "Ask AI failed" }, { status: 500 });
  }
}
