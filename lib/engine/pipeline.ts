// Orchestrates: analyze → (find emails if none) → generate draft (AI or template).
import { analyze, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft } from "./template";
import { aiDraft } from "./ai";
import type { Draft, EngineProfile } from "./types";

export type PipelineResult = {
  analysis: Analysis;
  emails: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "none";
  draft: Draft;
  draftSource: "ai" | "template";
};

export async function runPipeline(opts: {
  text: string;
  profile: EngineProfile;
  useAI: boolean;
  searchWeb?: boolean;
  hints?: { company?: string; country?: string; positions?: string[] };
}): Promise<PipelineResult> {
  const { text, profile, useAI, searchWeb = true, hints } = opts;
  const analysis = analyze(text);

  // Allow structured hints to override/augment detection.
  if (hints?.company) analysis.company = hints.company;
  if (hints?.positions?.length) analysis.positions = hints.positions;

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
    draft = await aiDraft({ text, analysis, profile });
    if (draft) draftSource = "ai";
  }
  if (!draft) draft = buildDraft(analysis, profile);

  return { analysis, emails, emailSource, draft, draftSource };
}
