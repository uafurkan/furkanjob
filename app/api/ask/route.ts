import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

const SYSTEM_PROMPT = (ctx: {
  company: string;
  country: string;
  roles: string[];
  subject: string;
  body: string;
}) => `You are a focused job application assistant inside Paply. The user is working on ONE specific application:

COMPANY: ${ctx.company}${ctx.country ? ` (${ctx.country})` : ""}
ROLE(S): ${ctx.roles.join(", ") || "Hospitality"}
EMAIL SUBJECT: ${ctx.subject}
EMAIL DRAFT:
"""
${ctx.body.slice(0, 2000)}
"""

Your ONLY job is to help the user improve, understand, or refine THIS specific application.
Answer concisely (2-4 sentences). If the user asks anything unrelated to this application or job search,
politely redirect: "I'm here to help with your ${ctx.company} application — what would you like to know about it?"
Never roleplay, write code, discuss other topics, or go off-context. Always respond in the same language as the user's question.`;

async function callGroq(systemPrompt: string, question: string): Promise<string | null> {
  const key = process.env.FREE_AI_API_KEY;
  const base = (process.env.FREE_AI_BASE_URL || "").replace(/\/+$/, "");
  const model = process.env.FREE_AI_MODEL || "llama-3.3-70b-versatile";
  if (!key || !base) return null;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function generateSuggestions(ctx: {
  company: string;
  country: string;
  roles: string[];
  subject: string;
  body: string;
  eligibilityNote?: string;
  fitScore?: number;
}): Promise<string[]> {
  const key = process.env.FREE_AI_API_KEY;
  const base = (process.env.FREE_AI_BASE_URL || "").replace(/\/+$/, "");
  const model = process.env.FREE_AI_MODEL || "llama-3.3-70b-versatile";
  if (!key || !base) return defaultSuggestions(ctx);

  const prompt = `A user is about to send a job application to "${ctx.company}"${ctx.country ? ` in ${ctx.country}` : ""} for: ${ctx.roles.join(", ") || "Hospitality"}.

Email subject: "${ctx.subject}"
Email body (first 600 chars): "${ctx.body.slice(0, 600)}"
${ctx.eligibilityNote ? `Eligibility note: "${ctx.eligibilityNote}"` : ""}
${typeof ctx.fitScore === "number" ? `Fit score: ${ctx.fitScore}/100` : ""}

Generate exactly 3 short, specific questions the user might want to ask about THIS application.
Make them practical and actionable — about tone, content, visa mention, length, or eligibility.
Return ONLY a JSON array of 3 strings, no other text. Example: ["Is the tone too formal?", "Should I mention my visa status earlier?", "Is this email too long?"]`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return defaultSuggestions(ctx);
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return defaultSuggestions(ctx);
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return parsed.slice(0, 3).map((s: unknown) => String(s).trim()).filter(Boolean);
    }
  } catch {}
  return defaultSuggestions(ctx);
}

function defaultSuggestions(ctx: { roles: string[]; eligibilityNote?: string; fitScore?: number }): string[] {
  const base = ["Is the tone right for this role?", "Is this email too long or too short?", "Should I mention my languages?"];
  if (ctx.eligibilityNote) base[2] = "What does the eligibility warning mean for me?";
  if (typeof ctx.fitScore === "number" && ctx.fitScore < 50) base[0] = "Should I still apply despite the low fit score?";
  return base;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(user.id, "generate");
    if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const mode: "suggestions" | "ask" = body?.mode || "ask";

    const ctx = {
      company: String(body?.company || ""),
      country: String(body?.country || ""),
      roles: Array.isArray(body?.roles) ? body.roles : [],
      subject: String(body?.subject || ""),
      body: String(body?.body || ""),
      eligibilityNote: body?.eligibilityNote ? String(body.eligibilityNote) : undefined,
      fitScore: typeof body?.fitScore === "number" ? body.fitScore : undefined,
    };

    if (mode === "suggestions") {
      const suggestions = await generateSuggestions(ctx);
      return NextResponse.json({ suggestions });
    }

    // mode === "ask"
    const question = String(body?.question || "").trim();
    if (!question) return NextResponse.json({ error: "No question provided." }, { status: 400 });

    const systemPrompt = SYSTEM_PROMPT(ctx);
    const answer = await callGroq(systemPrompt, question);
    if (!answer) return NextResponse.json({ error: "AI unavailable." }, { status: 503 });

    return NextResponse.json({ answer });
  } catch (e: any) {
    await reportError(e, { route: "ask" });
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
