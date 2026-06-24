// Orchestrates: understand (AI-first, heuristic fallback) → find emails if none → resolve language → draft.
import { analyze, detectTextLang, countryByCode, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, resolveAppLang, autoLangForCountry, APP_LANGS, type AppLang } from "./template";
import { aiAnalyze, aiDraft, aiEnabled, type AiTier } from "./ai";
import type { Draft, EngineProfile } from "./types";

export type PipelineResult = {
  analysis: Analysis;
  emails: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "none";
  draft: Draft;
  draftSource: "ai" | "template";
  language: AppLang;
};

export async function runPipeline(opts: {
  text: string;
  profile: EngineProfile;
  tier?: AiTier; // which model tier (free provider vs premium); AI is used whenever configured
  searchWeb?: boolean;
  language?: string; // per-request override; falls back to profile.applicationLanguage
  hints?: { company?: string; country?: string; positions?: string[] };
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
  if (!emails.length && searchWeb) {
    const found = await findEmails({ urls: analysis.urls, company: analysis.company, country: analysis.country.name });
    emails = found.emails;
    emailSource = found.source;
  }

  // Draft: AI when configured (tier picks the model), else the smart multilingual template.
  let draft: Draft | null = null;
  let draftSource: "ai" | "template" = "template";
  if (aiEnabled()) {
    draft = await aiDraft({ text, analysis, profile }, language, tier);
    if (draft) draftSource = "ai";
  }
  if (!draft) draft = buildDraft(analysis, profile, language);

  return { analysis, emails, emailSource, draft, draftSource, language };
}
