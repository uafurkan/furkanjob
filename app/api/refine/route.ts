import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { aiRefine, type RefineAction } from "@/lib/engine/ai";
import { APP_LANGS, type AppLang } from "@/lib/engine/template";
import { aiTier } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

const ACTIONS: RefineAction[] = ["shorter", "warmer", "formal", "regenerate"];

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "generate");
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const data = await req.json().catch(() => ({}));
    const body = String(data?.body || "").trim();
    const action = data?.action as RefineAction;
    if (!body) return NextResponse.json({ error: "Body is empty." }, { status: 400 });
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const valid = APP_LANGS.map((l) => l.code) as string[];
    const lang: AppLang = (valid.includes(data?.language) ? data.language : "en") as AppLang;

    const refined = await aiRefine({
      body,
      action,
      company: typeof data?.company === "string" ? data.company : undefined,
      lang,
      tier: aiTier(user.plan),
    });

    if (!refined) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ body: refined });
  } catch (e: any) {
    await reportError(e, { route: "refine" });
    return NextResponse.json({ error: e?.message || "refine failed" }, { status: 500 });
  }
}
