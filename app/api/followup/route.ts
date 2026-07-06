import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getApplication } from "@/lib/db";
import { aiFollowup, withAiDeadline } from "@/lib/engine/ai";
import { buildFollowup, APP_LANGS, type AppLang } from "@/lib/engine/template";
import { detectTextLang } from "@/lib/engine/detect";
import { aiTier } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "generate");
    if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const app = await getApplication(String(body?.applicationId || ""), user.id);
    if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

    const valid = APP_LANGS.map((l) => l.code) as string[];
    const detected = detectTextLang(`${app.subject}\n${app.body}`);
    const lang: AppLang = (detected && valid.includes(detected) ? detected : "en") as AppLang;
    const company = app.company || "your team";

    const draft =
      (await withAiDeadline(45000, () =>
        aiFollowup({
          company,
          country: app.country || undefined,
          roles: app.positions,
          originalSubject: app.subject,
          lang,
          tier: aiTier(user.plan),
        })
      )) || buildFollowup(company, lang);

    // Thread the follow-up under the original email: reuse "Re: <original subject>" and pass the ids.
    const reSubject = /^re:/i.test(app.subject.trim()) ? app.subject : `Re: ${app.subject}`;

    return NextResponse.json({
      subject: reSubject,
      body: draft.body,
      to: app.recipients,
      company: app.company,
      country: app.country,
      language: lang,
      inReplyToId: app.messageId || null,
      threadId: app.threadId || null,
    });
  } catch (e: any) {
    await reportError(e, { route: "followup" });
    return NextResponse.json({ error: e?.message || "follow-up failed" }, { status: 500 });
  }
}
