import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, getUsage, getDefaultCv, listApplications } from "@/lib/db";
import { toEngineProfile } from "@/lib/profile-adapter";
import { runPipeline } from "@/lib/engine/pipeline";
import { fetchPageText } from "@/lib/engine/websearch";
import { aiSubjectVariant } from "@/lib/engine/ai";
import { aiTier, isOverLimit, planInfo } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

// A single bare URL (no surrounding prose) → we fetch the page so the engine has content.
function asSingleUrl(s: string): string | null {
  const t = s.trim();
  if (/\s/.test(t)) return null;
  return /^https?:\/\/\S+$/i.test(t) || /^www\.\S+$/i.test(t) ? t : null;
}

export async function POST(req: Request) {
  try {
    return await handleGenerate(req);
  } catch (e: any) {
    await reportError(e, { route: "generate" });
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

async function handleGenerate(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, "generate");
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const body = await req.json().catch(() => ({}));
  let text: string = (body?.text || "").toString();
  if (!text.trim()) return NextResponse.json({ error: "Content is empty." }, { status: 400 });

  // If the user pasted just a URL, pull the page text (keep the URL so email scraping still sees it).
  let fetchedUrl = false;
  const url = asSingleUrl(text);
  if (url) {
    const pageText = await fetchPageText(url);
    if (pageText.trim().length > 40) {
      text = `${pageText}\n\n${url}`;
      fetchedUrl = true;
    }
  }

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

  const [cv, subjectB] = await Promise.all([
    getDefaultCv(user.id),
    aiSubjectVariant(
      result.draft.subject,
      result.analysis.company,
      result.analysis.positions,
      result.language as any,
      aiTier(user.plan)
    ).catch(() => null),
  ]);

  // Duplicate guard: have we already applied to this company or any of these emails?
  let duplicate: { id: string; company: string | null; when: string } | null = null;
  try {
    const prior = await listApplications(user.id);
    const emailSet = new Set(result.emails.map((e) => e.toLowerCase()));
    const companyLc = (result.analysis.company || "").trim().toLowerCase();
    const hit = prior.find(
      (a) =>
        (companyLc && (a.company || "").trim().toLowerCase() === companyLc) ||
        a.recipients.some((r) => emailSet.has(r.toLowerCase()))
    );
    if (hit) duplicate = { id: hit.id, company: hit.company ?? null, when: hit.createdAt };
  } catch {}

  return NextResponse.json({
    company: result.analysis.company,
    // Don't surface the grammatical fallback ("the destination country") as a country label.
    country: result.analysis.country.code === "XX" ? "" : result.analysis.country.name,
    positions: result.analysis.positions,
    emails: result.emails,
    emailSource: result.emailSource,
    // Recovery links: only useful (and only sent) when nothing was found.
    checkedOrigins: result.emailSource === "none" ? result.checkedOrigins.slice(0, 4) : [],
    subject: result.draft.subject,
    subjectB: subjectB || null,
    body: result.draft.body,
    draftSource: result.draftSource,
    language: result.language,
    countryCode: result.analysis.country.code,
    visaCovered: result.visaCovered,
    visaLabel: result.visaLabel,
    fetchedUrl,
    duplicate,
    cv: cv ? { filename: cv.filename } : null,
    overLimit,
    plan: user.plan,
    limit: planInfo(user.plan).monthlyLimit === Infinity ? null : planInfo(user.plan).monthlyLimit,
    used,
  });
}
