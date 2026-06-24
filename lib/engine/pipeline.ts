// Orchestrates: analyze → (find emails if none) → resolve language → generate draft (AI or template).
import { analyze, detectTextLang, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, resolveAppLang, autoLangForCountry, type AppLang } from "./template";
import { aiDraft } from "./ai";
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
  useAI: boolean;
  searchWeb?: boolean;
  language?: string; // per-request override; falls back to profile.applicationLanguage
  hints?: { company?: string; country?: string; positions?: string[] };
}): Promise<PipelineResult> {
  const { text, profile, useAI, searchWeb = true, hints } = opts;
  const analysis = analyze(text);

  if (hints?.company) analysis.company = hints.company;
  if (hints?.positions?.length) analysis.positions = hints.positions;

  // Resolve the application language. "auto" → detect from pasted text, else from country, else English.
  const requested = opts.language || profile.applicationLanguage || "auto";
  let language: AppLang;
  if (requested === "auto") {
    const fromText = detectTextLang(text) as AppLang | null;
    language = fromText || autoLangForCountry(analysis.country.code);
  } else {
    language = resolveAppLang(requested, analysis.country.code);
  }

  let emails = analysis.emails;
  let emailSource: PipelineResult["emailSource"] = emails.length ? "text" : "none";

  if (!emails.length && searchWeb) {
    const found = await findEmails({
      urls: analysis.urls,
      company: analysis.company,
      country: analysis.country.name,
    });
    emails = found.emails;
    emailSource = found.source;
  }

  let draft: Draft | null = null;
  let draftSource: "ai" | "template" = "template";
  if (useAI) {
    draft = await aiDraft({ text, analysis, profile }, language);
    if (draft) draftSource = "ai";
  }
  if (!draft) draft = buildDraft(analysis, profile, language);

  return { analysis, emails, emailSource, draft, draftSource, language };
}
