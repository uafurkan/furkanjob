// Orchestrates: understand (AI-first, heuristic fallback) → find emails if none → resolve language → draft.
import { analyze, detectTextLang, countryByCode, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, resolveAppLang, autoLangForCountry, APP_LANGS, type AppLang } from "./template";
import { aiAnalyze, aiAssessFit, aiDrafts, aiEnabled, aiCoverLetter, type AiTier, type Eligibility } from "./ai";
import { pickRelevantRoles } from "./match";
import { isVisaCovered } from "./visa";
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
  // Smart role fit: which of the user's target roles actually fit this business + suitability/eligibility.
  applyFor: string[];        // role(s) this application is for (subset that fits)
  droppedRoles: string[];    // target roles dropped as not-a-fit for this business
  fitScore: number;          // 0-100 suitability
  fitSummary: string;        // one human sentence
  eligibility: Eligibility;  // hard constraint read from the listing, crossed with user's visa status
  coverLetterBody: string | null;
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
  const { text, profile, tier = "free", searchWeb = true, hints } = opts;

  // Deterministic baseline (also the no-key fallback). Emails are ALWAYS extracted here, never by the AI.
  const analysis = analyze(text);

  // Smart layer: let the model clean up company/country/positions/language from the messy page.
  let aiLang: AppLang | undefined;
  if (aiEnabled()) {
    const ai = await aiAnalyze(text, tier);
    if (ai) {
      if (ai.company) analysis.company = ai.company;
      if (ai.countryCode && ai.countryCode !== "XX") analysis.country = countryByCode(ai.countryCode);
      if (ai.positions?.length) analysis.positions = ai.positions;
      if (ai.language) aiLang = ai.language;
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
  let emails = analysis.emails;
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
    emails = found.emails;
    emailSource = found.source;
    checkedOrigins = found.checkedOrigins;
  }

  // Held-visa intelligence: does the user already hold a visa that authorizes work here?
  const visaCovered = Boolean(profile.hasVisa) && isVisaCovered(profile.visaCountries, analysis.country.code);
  const visaLabel = visaCovered ? profile.visaLabel || null : null;
  const authorization = { authorized: visaCovered, visaLabel };

  // Smart fit: which target role(s) actually fit this business + suitability + eligibility.
  // The business's own advertised roles stay in `analysis.positions`; the application targets `applyFor`.
  const businessPositions = analysis.positions;
  let applyFor: string[] = [];
  let droppedRoles: string[] = [];
  let fitScore = 0;
  let fitSummary = "";
  let eligibility: Eligibility = { status: "ok", note: "" };

  if (aiEnabled()) {
    const fit = await aiAssessFit({
      text,
      company: analysis.company,
      countryName: analysis.country.name,
      countryVisa: analysis.country.visa,
      businessPositions,
      profile,
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
  // Deterministic fallback / safety net: if AI gave no roles, intersect target roles with the business.
  if (!applyFor.length) {
    const match = pickRelevantRoles(profile.targetRoles, businessPositions, undefined, text);
    applyFor = match.applyFor;
    if (!droppedRoles.length) droppedRoles = match.dropped;
  }
  // Last resort: apply for what the business offers (or leave to the draft to infer).
  if (!applyFor.length) applyFor = businessPositions.slice(0, 2);

  // The draft targets the chosen role(s), not the user's full wish list.
  const draftAnalysis: Analysis = { ...analysis, positions: applyFor.length ? applyFor : analysis.positions };

  // Draft: AI when configured (tier picks the model), else the smart multilingual template.
  let drafts: DraftOption[] = [];
  let draftSource: "ai" | "template" = "template";
  let coverLetterBody: string | null = null;
  if (aiEnabled()) {
    const [aiRes, aiCl] = await Promise.all([
      aiDrafts({ text, analysis: draftAnalysis, profile }, language, tier, authorization, applyFor, opts.reasoningEffort),
      aiCoverLetter({ text, analysis: draftAnalysis, profile }, language, tier, applyFor),
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
  };
}
