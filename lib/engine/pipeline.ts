// Orchestrates: understand (AI-first, heuristic fallback) → find emails if none → resolve language → draft.
import { analyze, detectTextLang, countryByCode, pickBestEmail, decodeHtmlEntities, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, resolveAppLang, autoLangForCountry, APP_LANGS, type AppLang } from "./template";
import { aiAnalyze, aiAssessFit, aiDrafts, aiEnabled, aiCoverLetter, type AiTier, type Eligibility } from "./ai";
import { pickRelevantRoles } from "./match";
import { isVisaCovered } from "./visa";
import { workKindForRoles, visaFor, registrationNote, type OrgType, type Intent } from "./professions";
import type { Draft, DraftOption, EngineProfile } from "./types";

export type PipelineResult = {
  analysis: Analysis;
  emails: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "none";
  draft: Draft;
  drafts: DraftOption[];
  draftSource: "ai" | "template";
  language: AppLang;
  // True when the user holds a visa that already authorizes work in the detected country.
  visaCovered: boolean;
  visaLabel: string | null;
  // Site origins the email search probed — offered as recovery links when none found.
  checkedOrigins: string[];
  // Smart role fit: which of the user's target roles actually fit this organization + suitability/eligibility.
  applyFor: string[];        // role(s)/program(s) this application is for (subset that fits)
  droppedRoles: string[];    // target roles dropped as not-a-fit for this organization
  fitScore: number;          // 0-100 suitability
  fitSummary: string;        // one human sentence
  eligibility: Eligibility;  // hard constraint read from the listing, crossed with user's visa status
  coverLetterBody: string | null;
  // Global intelligence: what kind of organization + whether this is a job or study application.
  orgType: OrgType;
  intent: Intent;
};

export async function runPipeline(opts: {
  text: string;
  profile: EngineProfile;
  tier?: AiTier; // which model tier (free provider vs premium); AI is used whenever configured
  searchWeb?: boolean;
  language?: string; // per-request override; falls back to profile.applicationLanguage
  hints?: { company?: string; country?: string; positions?: string[] };
  reasoningEffort?: "low" | "high";
}): Promise<PipelineResult> {
  const { text: rawText, profile, tier = "free", searchWeb = true, hints } = opts;
  const text = decodeHtmlEntities(rawText);

  // Deterministic baseline (also the no-key fallback). Emails are ALWAYS extracted here, never by the AI.
  const analysis = analyze(text);

  // Smart layer: let the model clean up company/country/positions/language from the messy page.
  let aiLang: AppLang | undefined;
  if (aiEnabled()) {
    const ai = await aiAnalyze(text, tier);
    if (ai) {
      const BLACKLISTED_COMPANIES = /^(gmail|googlemail|outlook|hotmail|yahoo|icloud|proton|protonmail|mail|live|me|msn|ymail|aol|zoho|fastmail|xtra|spark|clear|slingshot|orcon|snap|woosh|paradise|callplus|telecom|vodafone|mynet|superonline|ttmail|turknet|kablonet|google|skip to content|skip to main content|skip navigation|skip|home|menu|menus|book|book now|cart|contact|contact us|about|about us|welcome|gallery|privacy policy|terms of service|terms & conditions|website use|disclaimer|wix|shopify|squarespace|godaddy|wordpress|weebly|weweb|facebook|instagram|twitter|linkedin|youtube|tiktok|apple|android|admin login|admin|login|faq|faqs)$/i;
      if (ai.company && !BLACKLISTED_COMPANIES.test(ai.company.toLowerCase().trim())) {
        analysis.company = ai.company;
      }
      if (ai.countryCode && ai.countryCode !== "XX") analysis.country = countryByCode(ai.countryCode);
      if (ai.positions?.length) analysis.positions = ai.positions;
      if (ai.language) aiLang = ai.language;
      // The AI's read of the organization type and application intent wins over heuristics.
      if (ai.orgType) analysis.orgType = ai.orgType;
      if (ai.intent) analysis.intent = ai.intent;
    }
  }

  // Explicit user hints win over everything.
  if (hints?.company) analysis.company = hints.company;
  if (hints?.positions?.length) analysis.positions = hints.positions;
  if (hints?.country) {
    const c = countryByCode(hints.country);
    if (c.code !== "XX") analysis.country = c;
  }

  // Resolve the application language. "auto" → AI suggestion, else text detection, else country, else English.
  const requested = opts.language || profile.applicationLanguage || "auto";
  const validLangs = APP_LANGS.map((l) => l.code) as string[];
  let language: AppLang;
  if (requested === "auto") {
    language = aiLang || (detectTextLang(text) as AppLang | null) || autoLangForCountry(analysis.country.code);
  } else if (validLangs.includes(requested)) {
    language = resolveAppLang(requested, analysis.country.code);
  } else {
    language = autoLangForCountry(analysis.country.code);
  }

  // Emails: deterministic extraction from text, else real web search. Never generated.
  let emails = pickBestEmail(analysis.emails);
  let emailSource: PipelineResult["emailSource"] = emails.length ? "text" : "none";
  let checkedOrigins: string[] = [];
  if (!emails.length && searchWeb) {
    const found = await findEmails({
      urls: analysis.urls,
      company: analysis.company,
      country: analysis.country.code === "XX" ? "" : analysis.country.name,
      countryCode: analysis.country.code === "XX" ? "" : analysis.country.code,
      locality: analysis.locality,
      address: analysis.address,
      phone: analysis.phone,
    });
    emails = pickBestEmail(found.emails);
    emailSource = found.source;
    checkedOrigins = found.checkedOrigins;
  }

  // Held-visa intelligence: does the user already hold a visa that authorizes work here?
  const visaCovered = Boolean(profile.hasVisa) && isVisaCovered(profile.visaCountries, analysis.country.code);
  const visaLabel = visaCovered ? profile.visaLabel || null : null;
  const authorization = { authorized: visaCovered, visaLabel };

  const orgType = analysis.orgType;
  const intent = analysis.intent;

  // Smart fit: which target role(s) actually fit this organization + suitability + eligibility.
  // The organization's own advertised roles stay in `analysis.positions`; the application targets `applyFor`.
  const businessPositions = analysis.positions;
  let applyFor: string[] = [];
  let droppedRoles: string[] = [];
  let fitScore = 0;
  let fitSummary = "";
  let eligibility: Eligibility = { status: "ok", note: "" };

  if (intent === "study") {
    // University/school admissions: the "roles" are the study programs from the page. Job-fit
    // scoring doesn't apply — the fit panel stays hidden (empty summary, score 0, eligibility ok).
    applyFor = businessPositions.slice(0, 2);
  } else {
    if (aiEnabled()) {
      const fit = await aiAssessFit({
        text,
        company: analysis.company,
        countryName: analysis.country.name,
        countryVisa: analysis.country.visa,
        businessPositions,
        profile,
        orgType,
        lang: language,
        tier,
      });
      if (fit) {
        applyFor = fit.applyFor;
        droppedRoles = fit.droppedRoles;
        fitScore = fit.fitScore;
        fitSummary = fit.fitSummary;
        eligibility = fit.eligibility;
      }
    }
    // Deterministic fallback / safety net: if AI gave no roles, intersect target roles with the organization.
    if (!applyFor.length) {
      const match = pickRelevantRoles(profile.targetRoles, businessPositions, orgType, text);
      applyFor = match.applyFor;
      if (!droppedRoles.length) droppedRoles = match.dropped;
    }
    // Last resort: apply for what the organization offers (or leave to the draft to infer).
    if (!applyFor.length) applyFor = businessPositions.slice(0, 2);
  }

  // Visa wording adapted to WHAT the user is actually doing there: a farm hand and a dentist
  // need different visas in the same country, and a university applicant needs a student visa.
  const workKind = workKindForRoles(applyFor.length ? applyFor : profile.targetRoles);
  analysis.country = {
    ...analysis.country,
    visa: visaFor(analysis.country.code, workKind, intent, analysis.country.visa),
  };

  // Regulated-profession heads-up (dentist → AHPRA/GDC/dental council…): if the fit layer didn't
  // already flag something, surface the registration requirement as a soft warning. Product
  // knowledge, clearly non-blocking — never invented from the listing.
  if (intent === "job" && eligibility.status === "ok" && !eligibility.note && analysis.country.code !== "XX") {
    const note = registrationNote(applyFor, analysis.country.code, analysis.country.name);
    if (note && !visaCovered) eligibility = { status: "warning", note };
  }

  // The draft targets the chosen role(s)/program(s), not the user's full wish list.
  const draftAnalysis: Analysis = { ...analysis, positions: applyFor.length ? applyFor : analysis.positions };

  // Draft: AI when configured (tier picks the model), else the smart multilingual template.
  let drafts: DraftOption[] = [];
  let draftSource: "ai" | "template" = "template";
  let coverLetterBody: string | null = null;
  if (aiEnabled()) {
    const [aiRes, aiCl] = await Promise.all([
      aiDrafts({ text, analysis: draftAnalysis, profile }, language, tier, authorization, applyFor, opts.reasoningEffort, { orgType, intent }),
      aiCoverLetter({ text, analysis: draftAnalysis, profile }, language, tier, applyFor, { orgType, intent }),
    ]);
    if (aiRes && aiRes.length) {
      drafts = aiRes;
      draftSource = "ai";
    }
    coverLetterBody = aiCl;
  }
  if (!drafts.length) {
    const fallbackDraft = buildDraft(draftAnalysis, profile, language, authorization);
    drafts = [{
      subject: fallbackDraft.subject,
      body: fallbackDraft.body,
      style: "Balanced & Personal"
    }];
  }

  return {
    analysis, emails, emailSource,
    draft: { subject: drafts[0].subject, body: drafts[0].body },
    drafts,
    draftSource, language, visaCovered, visaLabel, checkedOrigins,
    applyFor, droppedRoles, fitScore, fitSummary, eligibility,
    coverLetterBody,
    orgType, intent,
  };
}
