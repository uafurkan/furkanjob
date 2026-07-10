import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, getUsage, getDefaultCv, listApplications } from "@/lib/db";
import { toEngineProfile } from "@/lib/profile-adapter";
import { enrichProfileWithDocuments } from "@/lib/profile-context";
import { findDuplicateApplication } from "@/lib/applications";
import { runPipeline } from "@/lib/engine/pipeline";
import { fetchPageText } from "@/lib/engine/websearch";
import { aiTier, isOverLimit, planInfo } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
// This route runs several sequential AI calls (analyze, fit assessment, drafts, cover letter,
// subject variant) plus an optional web search for the recipient email — without an explicit
// maxDuration it inherited the platform's short default, so on a slow provider it hit the
// timeout and returned an HTML error page instead of JSON ("Unexpected token '<'" on the client).
export const maxDuration = 60;

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

  const url = asSingleUrl(text);

  // Parallelise: URL page-fetch (potentially slow, 1-3 s) and all DB/storage work run
  // simultaneously so neither blocks the other before the AI pipeline starts.
  const [urlPageText, profileResult, used] = await Promise.all([
    url ? fetchPageText(url) : Promise.resolve(null),
    (async () => {
      const profile = await getProfile(user.id);
      let engineProfile = toEngineProfile(profile, user);
      engineProfile = await enrichProfileWithDocuments(user.id, engineProfile);
      return { profile, engineProfile };
    })(),
    getUsage(user.id),
  ]);

  const { profile, engineProfile: rawEngineProfile } = profileResult;
  let engineProfile = rawEngineProfile;

  let fetchedUrl = false;
  if (url && urlPageText && urlPageText.trim().length > 40) {
    text = `${urlPageText}\n\n${url}`;
    fetchedUrl = true;
  }

  const overLimit = isOverLimit(user.plan, used);

  // A client-side visa type override (from the VisaTypeSelector re-draft) wins over the
  // stored profile preference. An empty string means "clear override, use stored preference".
  if (typeof body?.visaTypeOverride === "string" && body.visaTypeOverride) {
    engineProfile = { ...engineProfile, preferredVisaType: body.visaTypeOverride };
  }

  // Fire DB-only queries that are only needed after the pipeline — CV filename for the
  // response envelope and duplicate-application detection.
  const cvPromise = getDefaultCv(user.id);
  const applicationsPromise = listApplications(user.id).catch(() => []);

  const result = await runPipeline({
    text,
    profile: engineProfile,
    tier: aiTier(user.plan),
    searchWeb: true,
    language: body?.language || undefined,
    reasoningEffort: body?.reasoningEffort || undefined,
    hints: {
      company: body?.company || undefined,
      country: body?.country || undefined,
      positions: Array.isArray(body?.positions) ? body.positions : undefined,
    },
  });

  // aiSubjectVariant was a nice-to-have (alternate subject line) that ran sequentially AFTER
  // the pipeline, adding 2-3 s to every request. Removed to stay within the platform timeout.
  const cv = await cvPromise;

  // Duplicate guard: have we already applied to this company?
  let duplicate: { id: string; company: string | null; when: string } | null = null;
  try {
    const prior = await applicationsPromise;
    const hit = findDuplicateApplication(prior, { company: result.analysis.company, emails: result.emails });
    if (hit) duplicate = { id: hit.id, company: hit.company ?? null, when: hit.createdAt };
  } catch {}

  return NextResponse.json({
    company: result.analysis.company,
    // Don't surface the grammatical fallback ("the destination country") as a country label.
    country: result.analysis.country.code === "XX" ? "" : result.analysis.country.name,
    positions: result.analysis.positions,
    // Global intelligence: organization type + job vs study application.
    orgType: result.orgType,
    intent: result.intent,
    isRecruitmentAgency: result.isRecruitmentAgency,
    // Smart role fit + suitability/eligibility.
    applyFor: result.applyFor,
    droppedRoles: result.droppedRoles,
    fitScore: result.fitScore,
    fitSummary: result.fitSummary,
    eligibility: result.eligibility,
    emails: result.emails,
    emailSource: result.emailSource,
    // Recovery links: only useful (and only sent) when nothing was found.
    checkedOrigins: result.emailSource === "none" ? result.checkedOrigins.slice(0, 4) : [],
    subject: result.draft.subject,
    subjectB: null,
    body: result.draft.body,
    drafts: result.drafts,
    coverLetterBody: result.coverLetterBody || null,
    coverLetterSource: result.coverLetterSource,
    fullName: profile?.fullName || user.name || "",
    contactEmail: profile?.contactEmail || user.email || "",
    includeSignature: profile?.includeSignature || false,
    draftSource: result.draftSource,
    language: result.language,
    countryCode: result.analysis.country.code,
    visaCovered: result.visaCovered,
    visaLabel: result.visaLabel,
    // Deep visa intelligence for the UI panel: shortage list, WHV eligibility, panel notes.
    visaIntelligence: result.visaIntelligence
      ? {
          onSkillShortageList: result.visaIntelligence.onSkillShortageList,
          shortageListName: result.visaIntelligence.shortageListName,
          shortageStream: result.visaIntelligence.shortageStream,
          shortageNote: result.visaIntelligence.shortageNote,
          workingHolidayEligible: result.visaIntelligence.workingHolidayEligible,
          workingHolidayNote: result.visaIntelligence.workingHolidayNote,
          panelNotes: result.visaIntelligence.panelNotes,
          wording: result.visaIntelligence.wording,
        }
      : null,
    // Feature 3: Cold email mode (no advertised positions → speculative enquiry).
    coldEmail: result.coldEmail,
    // Visa type that was used for this draft (null = generic wording).
    preferredVisaType: result.preferredVisaType || null,
    // Feature 4: Short company research snippet extracted from the page.
    companySnippet: result.companySnippet || null,
    // Feature 5: Salary intelligence for these roles in this country.
    salary: result.salary.band
      ? {
          min: result.salary.band.min,
          max: result.salary.band.max,
          currency: result.salary.band.currency,
          period: result.salary.band.period,
        }
      : null,
    // Application intelligence: skills gap, sponsorship signal, freshness, tone, response rate.
    intelligence: {
      skillsGap: {
        matchedSkills: result.skillsGap.matchedSkills,
        gapSkills: result.skillsGap.gapSkills,
        strengthHighlights: result.skillsGap.strengthHighlights,
        experienceRequired: result.skillsGap.experienceRequired,
        educationRequired: result.skillsGap.educationRequired,
      },
      sponsorshipSignal: result.sponsorshipSignal.signal,
      sponsorshipNote: result.sponsorshipSignal.note,
      postingFreshness: result.postingFreshness.label,
      postingAgeDays: result.postingFreshness.ageDays,
      freshnessNote: result.postingFreshness.note,
      postingTone: result.postingTone,
      whvTimeline: result.whvTimeline.urgencyLevel !== "unknown" ? {
        monthsRemaining: result.whvTimeline.monthsRemaining,
        urgencyLevel: result.whvTimeline.urgencyLevel,
        note: result.whvTimeline.note,
      } : null,
      responseRate: {
        score: result.responseRate.score,
        label: result.responseRate.label,
        factors: result.responseRate.factors,
      },
    },
    fetchedUrl,
    duplicate,
    cv: cv ? { filename: cv.filename } : null,
    overLimit,
    plan: user.plan,
    limit: planInfo(user.plan).monthlyLimit === Infinity ? null : planInfo(user.plan).monthlyLimit,
    used,
  });
}
