import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { aiAsk } from "@/lib/engine/ai";
import { APP_LANGS, type AppLang } from "@/lib/engine/template";
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
    const jobText = String(data?.jobText || "").trim();
    const question = String(data?.question || "").trim();
    const company = typeof data?.company === "string" ? data.company : undefined;

    if (!body) return NextResponse.json({ error: "Email body is empty." }, { status: 400 });
    if (!question) return NextResponse.json({ error: "Question is empty." }, { status: 400 });

    const validLangs = APP_LANGS.map((l) => l.code) as string[];
    const lang: AppLang = (validLangs.includes(data?.language) ? data.language : "en") as AppLang;

    const result = await aiAsk({
      body,
      jobText,
      question,
      company,
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
