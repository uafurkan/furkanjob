// Orchestrates: understand (AI-first, heuristic fallback) → find emails if none → resolve language → draft.
import { analyze, detectTextLang, countryByCode, pickBestEmail, decodeHtmlEntities, domainCoreWords, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, buildCoverLetter, resolveAppLang, autoLangForCountry, APP_LANGS, type AppLang } from "./template";
import { aiAnalyze, aiAssessFit, aiDrafts, aiEnabled, aiCoverLetter, withAiDeadline, withAiSubBudget, type AiTier, type Eligibility } from "./ai";
import { pickRelevantRoles } from "./match";
import { isVisaCovered } from "./visa";
import { workKindForRoles, visaFor, registrationNote, type OrgType, type Intent } from "./professions";
import { assessVisaOptions, type VisaIntelligence } from "./visa-smart";
import type { Draft, DraftOption, EngineProfile } from "./types";

// Strip page-title pollution from the end of an AI-extracted company name:
// copyright lines, legal notice text, geographic descriptors, navigation labels.
// E.g. "Capri On Fenton Rotorua New Zealand Privacy Policy" → "Capri On Fenton"
function cleanCompanyName(raw: string): string {
  let s = raw.trim();

  // Strip trailing street address fragments: "Company 288 Fenton St Glenholme" → "Company"
  // Copyright lines often include the full address after the brand name.
  s = s.replace(/\s+\d+[A-Za-z]?\s+\w[\w\s]*\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|way|close|court|ct|crescent|terrace|boulevard|blvd)\b.*$/i, "").trim();
  // Also strip bare number prefixes left over from above (e.g. "288" alone after stripping "Fenton St…").
  s = s.replace(/\s+\d+\s*$/, "").trim();

  // Remove trailing legal/policy/navigation/job-platform fragments (greedy: strip multiple if stacked).
  const TAIL_PATTERNS = [
    // Legal / policy
    /[,|·•–—\-]\s*(privacy policy|terms of service|terms & conditions|terms and conditions|cookie policy|cookie notice|disclaimer|legal notice|copyright notice|accessibility statement|sitemap|all rights reserved)\s*$/i,
    /\s+(privacy policy|terms of service|terms & conditions|terms and conditions|cookie policy|cookie notice|disclaimer|legal notice|copyright notice|accessibility statement|sitemap|all rights reserved)$/i,
    /\s+(contact us|about us|home|menu|book now|apply now|careers|jobs|vacancies|login|sign in|sign up|faq|faqs)$/i,
    // Job platform suffixes — "Company | Seek", "Company - Indeed", "Company on LinkedIn", etc.
    /\s*[|\-–—]\s*(seek(\.co\.nz|\.com\.au)?|indeed(\.com)?|linkedin(\.com)?|trademe\s*jobs?|glassdoor(\.com)?|monster(\.com)?|reed(\.co\.uk)?|workable|bamboohr|smartrecruiters|jobadder|seek)\s*$/i,
    /\s+on\s+(seek|indeed|linkedin|trademe|glassdoor|monster|reed|workable)\s*$/i,
    // "Company Careers" / "Company Jobs" suffix
    /\s+(careers|jobs|vacancies|employment|hiring)\s*page\s*$/i,
    /\s+(careers?|jobs?)\s*$/i,
  ];
  let prev = "";
  while (s !== prev) {
    prev = s;
    for (const re of TAIL_PATTERNS) s = s.replace(re, "").trim();
  }

  // Strip trailing geographic descriptors that copyright lines append after the brand name.
  // Pattern: "BrandName, City, Country" or "BrandName City Country" → "BrandName"
  // Only strip city names if a country name was also stripped (to avoid "Hotel Montreal" → "Hotel").
  const COUNTRIES = new Set([
    "new zealand","australia","united states","united kingdom","canada","ireland","germany","france",
    "italy","spain","portugal","netherlands","switzerland","austria","greece","sweden","denmark",
    "norway","belgium","finland","poland","czechia",
    // Abbreviations copyright lines commonly use instead of the full country name.
    "nz","au","uk","usa","us","ca",
  ]);
  const CITIES = new Set([
    "auckland","wellington","christchurch","hamilton","dunedin","tauranga","napier","palmerston north",
    "rotorua","queenstown","whangarei","invercargill","nelson","blenheim","taupo","new plymouth",
    "hastings","gisborne","wanaka",
    "sydney","melbourne","brisbane","perth","adelaide","canberra","hobart","darwin","cairns","gold coast",
    "london","edinburgh","glasgow","manchester","birmingham","toronto","vancouver","calgary",
    "new york","los angeles","chicago","houston","miami","las vegas","san francisco",
  ]);
  // Generic industry descriptors that copyright lines append after the town name ("Chevron Motel,
  // Taupo Accommodation, NZ") — not part of the brand, but not a recognized city/country either, so
  // they'd otherwise block the city strip below from ever reaching "Taupo".
  const GENERIC_TRAILING_WORDS = new Set(["accommodation", "accommodations", "hospitality"]);

  // Repeatedly strip trailing country/city/generic-descriptor words until stable.
  let stripped = false;
  let prev2 = "";
  while (s !== prev2) {
    prev2 = s;
    const words = s.split(/\s+/);
    // Check 1- and 2-word trailing phrases against countries.
    for (let len = 2; len >= 1; len--) {
      if (words.length <= len) continue;
      const tail = words.slice(-len).join(" ").toLowerCase();
      if (COUNTRIES.has(tail)) {
        const candidate = words.slice(0, -len).join(" ").replace(/[,·•–—\-]+$/, "").trim();
        if (candidate.length >= 2) { s = candidate; stripped = true; break; }
      }
    }
    if (s !== prev2) continue;
    const lastWord = words[words.length - 1]?.toLowerCase().replace(/[,·•–—\-]+$/, "");
    if (words.length > 1 && lastWord && GENERIC_TRAILING_WORDS.has(lastWord)) {
      s = words.slice(0, -1).join(" ").replace(/[,·•–—\-]+$/, "").trim();
    }
  }
  // Only remove trailing city names when a country was also stripped (avoids "Hotel Montreal" → "Hotel").
  if (stripped) {
    let prev3 = "";
    while (s !== prev3) {
      prev3 = s;
      const words = s.split(/\s+/);
      for (let len = 2; len >= 1; len--) {
        if (words.length <= len) continue;
        const tail = words.slice(-len).join(" ").toLowerCase();
        if (CITIES.has(tail)) {
          const candidate = words.slice(0, -len).join(" ").replace(/[,·•–—\-]+$/, "").trim();
          if (candidate.length >= 2) { s = candidate; break; }
        }
      }
    }
  }

  return s.trim();
}

// A real organization name is a short proper noun/brand, never a full sentence or a bullet-point
// benefit ("Continued on the job learning with the Imperium Group" is a PERK, not the employer).
// Catches AI misreads that a plain blacklist of exact phrases can't (any provider, any wording).
function looksLikeBrandName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  if (/^(continued|providing|including|offering|working|located|situated|serving|based|founded|established|committed|dedicated|helping|proud|building|creating|delivering|supporting|ensuring|striving|competitive|professional|flexible|reliable)\b/i.test(trimmed)) return false;
  if (/\b(on the job|we offer|in return|join our team|apply now|click here|read more|find out|learn more|working environment|remuneration package)\b/i.test(trimmed)) return false;
  const stopWords = new Set(["the", "a", "an", "of", "in", "on", "at", "for", "with", "and", "by", "to", "from", "&"]);
  const significant = words.filter((w) => !stopWords.has(w.toLowerCase()));
  if (significant.length === 0) return false;
  const capitalized = significant.filter((w) => /^[A-Z0-9]/.test(w));
  return capitalized.length / significant.length >= 0.6;
}

// A single bare word (no multi-word structure, no venue/legal suffix) is exactly the shape of a
// person's first name, which is what an LLM sometimes mistakes for the business name on a sparse
// page (e.g. a "Contact Mark for bookings" note). A repeated first name on a small "contact us" page
// ("Contact Mark", "Email Mark", "Mark's direct line") passes a naive repetition check just as easily
// as a real one-word brand would — repetition alone is NOT a safe signal here. The only safe signal is
// that the word actually matches the business's own domain (a first name essentially never does).
function singleWordGuessIsGrounded(name: string, urls: string[]): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 1) return true; // multi-word names are already a stronger signal
  const word = words[0].toLowerCase();
  return domainCoreWords(urls).includes(word);
}

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
  // True when the listing is from a recruitment/staffing agency posting on behalf of a client.
  isRecruitmentAgency: boolean;
  // Deep visa intelligence: best pathway, shortage list match, WHV eligibility, panel notes.
  visaIntelligence: VisaIntelligence | null;
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
  // This request makes several SEQUENTIAL AI calls (analyze, fit assessment, drafts, cover
  // letter), each of which can walk a chain of several fallback providers. Sharing one deadline
  // across all of them keeps the whole pipeline within the route's maxDuration even in the
  // worst case (every provider slow/rate-limited) — once the budget is spent, remaining
  // providers are skipped and the caller falls back to the deterministic template.
  return withAiDeadline(45000, () => runPipelineInner(opts));
}

async function runPipelineInner(opts: {
  text: string;
  profile: EngineProfile;
  tier?: AiTier;
  searchWeb?: boolean;
  language?: string;
  hints?: { company?: string; country?: string; positions?: string[] };
  reasoningEffort?: "low" | "high";
}): Promise<PipelineResult> {
  const { text: rawText, profile, tier = "free", searchWeb = true, hints } = opts;
  const text = decodeHtmlEntities(rawText);

  // Deterministic baseline (also the no-key fallback). Emails are ALWAYS extracted here, never by the AI.
  const analysis = analyze(text);

  // Clean the heuristic company name too — the raw scraped text can carry page-title pollution
  // even before the AI layer runs (e.g. "Capri On Fenton Rotorua New Zealand Privacy Policy").
  const BLACKLISTED_COMPANIES = /^(gmail|googlemail|outlook|hotmail|yahoo|icloud|proton|protonmail|mail|live|me|msn|ymail|aol|zoho|fastmail|xtra|spark|clear|slingshot|orcon|snap|woosh|paradise|callplus|telecom|vodafone|mynet|superonline|ttmail|turknet|kablonet|google|skip to content|skip to main content|skip navigation|skip|home|menu|menus|book|book now|cart|contact|contact us|about|about us|welcome|gallery|privacy policy|terms of service|terms & conditions|website use|disclaimer|wix|shopify|squarespace|godaddy|wordpress|weebly|weweb|facebook|instagram|twitter|linkedin|youtube|tiktok|apple|android|admin login|admin|login|faq|faqs)$/i;
  if (analysis.company) {
    const cleaned = cleanCompanyName(analysis.company);
    if (
      cleaned && !BLACKLISTED_COMPANIES.test(cleaned.toLowerCase().trim()) && looksLikeBrandName(cleaned)
      && singleWordGuessIsGrounded(cleaned, analysis.urls)
    ) {
      analysis.company = cleaned;
    }
  }

  // Smart layer: let the model clean up company/country/positions/language from the messy page.
  let aiLang: AppLang | undefined;
  if (aiEnabled()) {
    // Capped sub-budget: analysis is the first of four sequential/parallel AI calls in this
    // pipeline — without a cap, a slow/rate-limited provider chain here could burn the whole
    // request deadline before the drafts/cover-letter stage (the actual deliverable) gets a turn.
    const ai = await withAiSubBudget(12000, () => aiAnalyze(text, tier));
    if (ai) {
      if (ai.company) {
        const cleaned = cleanCompanyName(ai.company);
        if (
          cleaned && !BLACKLISTED_COMPANIES.test(cleaned.toLowerCase().trim()) && looksLikeBrandName(cleaned)
          && singleWordGuessIsGrounded(cleaned, analysis.urls)
        ) {
          analysis.company = cleaned;
        }
      }
      if (ai.countryCode && ai.countryCode !== "XX") analysis.country = countryByCode(ai.countryCode);
      if (ai.positions?.length) analysis.positions = ai.positions;
      if (ai.language) aiLang = ai.language;
      // The AI's read of the organization type and application intent wins over heuristics.
      if (ai.orgType) analysis.orgType = ai.orgType;
      if (ai.intent) analysis.intent = ai.intent;
      if (ai.isRecruitmentAgency) analysis.isRecruitmentAgency = true;
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
      isGovernmentOrg: analysis.orgType === "government",
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
      // Same reasoning as the analysis sub-budget above: cap this stage so it can't starve the
      // drafts/cover-letter stage that follows it.
      const fit = await withAiSubBudget(12000, () => aiAssessFit({
        text,
        company: analysis.company,
        countryName: analysis.country.name,
        countryVisa: analysis.country.visa,
        businessPositions,
        profile,
        orgType,
        lang: language,
        tier,
      }));
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
  const baseVisaWording = visaFor(analysis.country.code, workKind, intent, analysis.country.visa);
  analysis.country = { ...analysis.country, visa: baseVisaWording };

  // Deep visa intelligence: shortage list match, WHV eligibility, enhanced wording, panel notes.
  // Runs only when the user actually needs sponsorship (not already visa-covered) and the
  // destination is known. The enhanced wording replaces the generic visaFor() sentence.
  let visaIntelligence: VisaIntelligence | null = null;
  if (profile.needsVisaSponsorship && !visaCovered && analysis.country.code !== "XX" && intent === "job") {
    visaIntelligence = assessVisaOptions({
      applyFor: applyFor.length ? applyFor : profile.targetRoles,
      workKind,
      countryCode: analysis.country.code,
      countryName: analysis.country.name,
      fallbackWording: baseVisaWording,
      intent,
      profile,
    });
    // Upgrade the visa wording in the analysis so drafts and cover letters use the enriched sentence.
    if (visaIntelligence.wording && visaIntelligence.wording !== baseVisaWording) {
      analysis.country = { ...analysis.country, visa: visaIntelligence.wording };
    }
    // Inject shortage list / WHV notes into eligibility panel when nothing else is flagged.
    if (visaIntelligence.panelNotes.length && eligibility.status === "ok" && !eligibility.note) {
      eligibility = { status: "warning", note: visaIntelligence.panelNotes[0] };
    }
  }

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
  // AI cover letter failed/unavailable: use the dedicated cover-letter template, never the email
  // body — a cover letter that's a verbatim copy of the email defeats the point of attaching one.
  if (!coverLetterBody) {
    coverLetterBody = buildCoverLetter(draftAnalysis, profile, language, authorization);
  }

  return {
    analysis, emails, emailSource,
    draft: { subject: drafts[0].subject, body: drafts[0].body },
    drafts,
    draftSource, language, visaCovered, visaLabel, checkedOrigins,
    applyFor, droppedRoles, fitScore, fitSummary, eligibility,
    coverLetterBody,
    orgType, intent,
    isRecruitmentAgency: Boolean(analysis.isRecruitmentAgency),
    visaIntelligence,
  };
}
