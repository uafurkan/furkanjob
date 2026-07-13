// Orchestrates: understand (AI-first, heuristic fallback) → find emails if none → resolve language → draft.
import { analyze, detectTextLang, countryByCode, pickBestEmail, decodeHtmlEntities, domainCoreWords, type Analysis } from "./detect";
import { findEmails } from "./websearch";
import { buildDraft, buildCoverLetter, resolveAppLang, autoLangForCountry, APP_LANGS, type AppLang } from "./template";
import { aiAnalyze, aiAssessFit, aiAnalyzeAndFit, aiDrafts, aiEnabled, withAiDeadline, withAiSubBudget, type AiTier, type Eligibility } from "./ai";
import { pickRelevantRoles } from "./match";
import { isVisaCovered } from "./visa";
import { workKindForRoles, visaFor, registrationNote, type OrgType, type Intent } from "./professions";
import { assessVisaOptions, type VisaIntelligence } from "./visa-smart";
import {
  analyzeSkillsGap, detectSponsorshipSignal, detectPostingFreshness,
  assessWhvTimeline, detectPostingTone, predictResponseRate,
  type SkillsGap, type SponsorshipSignal, type PostingFreshness,
  type WhvTimeline, type PostingTone, type ResponseRatePrediction,
} from "./intelligence";
import { getSalaryBand, type SalaryResult } from "./salary";
import type { Draft, DraftOption, EngineProfile } from "./types";

// Strip page-title pollution from the end of an AI-extracted company name:
// copyright lines, legal notice text, geographic descriptors, navigation labels.
// E.g. "Capri On Fenton Rotorua New Zealand Privacy Policy" → "Capri On Fenton"
function cleanCompanyName(raw: string): string {
  let s = raw.trim();

  // Strip phone numbers appended to or embedded in company names.
  // AU/NZ toll-free: "Company 1300 454 824" or "Company 0800 123 456"
  s = s.replace(/\s+(?:1[38]\d{2}|0[78]\d{2})\s+\d{3}\s+\d{3}\s*$/g, "").trim();
  // Generic digit blocks: "Company 03 4567 8901"
  s = s.replace(/\s+\(?\d{2,4}\)?\s*\d{3,4}[\s\-]\d{3,4}\s*$/g, "").trim();
  // Strip leading "1300" / "1800" phone prefix when it starts the whole string
  // (vanity numbers like "1300 4 KITCHENS" → keep the word part only)
  s = s.replace(/^(?:1[38]\d{2}|0[78]\d{2})\s+/i, "").trim();
  // Strip trailing lone phone digit group left after above (e.g. "4 KITCHENS 454")
  s = s.replace(/\s+\d{3,4}\s*$/, "").trim();

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
  // Normalize apostrophes so "Matso's" matches domain core "matsos"
  const word = words[0].toLowerCase().replace(/['']/g, "");
  const wordNoS = word.endsWith("s") ? word.slice(0, -1) : "";
  const cores = domainCoreWords(urls);
  return cores.includes(word) || (wordNoS.length >= 3 && cores.includes(wordNoS));
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
  coverLetterSource: "template" | "ai";
  // Global intelligence: what kind of organization + whether this is a job or study application.
  orgType: OrgType;
  intent: Intent;
  // True when the listing is from a recruitment/staffing agency posting on behalf of a client.
  isRecruitmentAgency: boolean;
  // Deep visa intelligence: best pathway, shortage list match, WHV eligibility, panel notes.
  visaIntelligence: VisaIntelligence | null;
  // Application intelligence layer (deterministic, no AI required).
  skillsGap: SkillsGap;
  sponsorshipSignal: SponsorshipSignal;
  postingFreshness: PostingFreshness;
  whvTimeline: WhvTimeline;
  postingTone: PostingTone;
  responseRate: ResponseRatePrediction;
  // Salary intelligence: indicative band for these roles in this country.
  salary: SalaryResult;
  // True when the business has no advertised positions and we're sending a speculative enquiry.
  coldEmail: boolean;
  // The specific visa type that was used for this draft (null = generic wording).
  preferredVisaType: string | null;
  // A 1-2 sentence company description extracted deterministically from the listing (used in AI prompts).
  companySnippet: string | null;
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
  return withAiDeadline(20000, () => runPipelineInner(opts));
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

  // Resolve the requested language before the AI call so we can pass it as the output language.
  const requested = opts.language || profile.applicationLanguage || "auto";
  const validLangs = APP_LANGS.map((l) => l.code) as string[];

  // Smart layer: ONE combined AI call does both analysis AND fit-assessment in a single
  // round-trip. This replaces two sequential calls (aiAnalyze → aiAssessFit) with one,
  // cutting the AI latency roughly in half. Falls back to separate calls if the combined
  // result is unusable (returns null when applyFor is empty).
  let aiLang: AppLang | undefined;
  let combinedFit: import("./ai").AiAnalyzeAndFitResult | null = null;
  let separateFitResult: import("./ai").FitAssessment | null = null;

  if (aiEnabled()) {
    combinedFit = await withAiSubBudget(8000, () =>
      aiAnalyzeAndFit({ text, profile, tier, lang: requested !== "auto" && validLangs.includes(requested) ? (requested as AppLang) : undefined })
    );

    if (combinedFit) {
      // Apply analysis part
      if (combinedFit.company) {
        const cleaned = cleanCompanyName(combinedFit.company);
        if (cleaned && !BLACKLISTED_COMPANIES.test(cleaned.toLowerCase().trim()) && looksLikeBrandName(cleaned) && singleWordGuessIsGrounded(cleaned, analysis.urls)) {
          analysis.company = cleaned;
        }
      }
      if (combinedFit.countryCode && combinedFit.countryCode !== "XX") analysis.country = countryByCode(combinedFit.countryCode);
      if (combinedFit.positions?.length) analysis.positions = combinedFit.positions;
      if (combinedFit.language) aiLang = combinedFit.language;
      if (combinedFit.orgType) analysis.orgType = combinedFit.orgType;
      if (combinedFit.intent) analysis.intent = combinedFit.intent;
      if (combinedFit.isRecruitmentAgency) analysis.isRecruitmentAgency = true;
    } else {
      // Combined call failed/unusable — fall back to separate sequential calls.
      const ai = await withAiSubBudget(5000, () => aiAnalyze(text, tier));
      if (ai) {
        if (ai.company) {
          const cleaned = cleanCompanyName(ai.company);
          if (cleaned && !BLACKLISTED_COMPANIES.test(cleaned.toLowerCase().trim()) && looksLikeBrandName(cleaned) && singleWordGuessIsGrounded(cleaned, analysis.urls)) {
            analysis.company = cleaned;
          }
        }
        if (ai.countryCode && ai.countryCode !== "XX") analysis.country = countryByCode(ai.countryCode);
        if (ai.positions?.length) analysis.positions = ai.positions;
        if (ai.language) aiLang = ai.language;
        if (ai.orgType) analysis.orgType = ai.orgType;
        if (ai.intent) analysis.intent = ai.intent;
        if (ai.isRecruitmentAgency) analysis.isRecruitmentAgency = true;
      }
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
  let language: AppLang;
  if (requested === "auto") {
    language = aiLang || (detectTextLang(text) as AppLang | null) || autoLangForCountry(analysis.country.code);
  } else if (validLangs.includes(requested)) {
    language = resolveAppLang(requested, analysis.country.code);
  } else {
    language = autoLangForCountry(analysis.country.code);
  }

  // Held-visa intelligence: does the user already hold a visa that authorizes work here?
  const visaCovered = Boolean(profile.hasVisa) && isVisaCovered(profile.visaCountries, analysis.country.code);
  const visaLabel = visaCovered ? profile.visaLabel || null : null;
  const authorization = { authorized: visaCovered, visaLabel };

  const orgType = analysis.orgType;
  const intent = analysis.intent;
  const businessPositions = analysis.positions;

  // Email search runs in parallel with the (possible) fallback fit assessment.
  let emails = pickBestEmail(analysis.emails);
  let emailSource: PipelineResult["emailSource"] = emails.length ? "text" : "none";
  let checkedOrigins: string[] = [];

  const emailSearchPromise = (!emails.length && searchWeb)
    ? withAiSubBudget(10000, () => findEmails({
        urls: analysis.urls,
        company: analysis.company,
        country: analysis.country.code === "XX" ? "" : analysis.country.name,
        countryCode: analysis.country.code === "XX" ? "" : analysis.country.code,
        locality: analysis.locality,
        address: analysis.address,
        phone: analysis.phone,
        isGovernmentOrg: analysis.orgType === "government",
      }))
    : Promise.resolve(null);

  // Only run a separate aiAssessFit if the combined call failed AND this is a job application.
  const separateFitPromise = (!combinedFit && intent !== "study" && aiEnabled())
    ? withAiSubBudget(5000, () => aiAssessFit({
        text,
        company: analysis.company,
        countryName: analysis.country.name,
        countryVisa: analysis.country.visa,
        businessPositions,
        profile,
        orgType,
        lang: language,
        tier,
      }))
    : Promise.resolve(null);

  const [emailResult, fallbackFitResult] = await Promise.all([emailSearchPromise, separateFitPromise]);
  separateFitResult = fallbackFitResult;

  if (emailResult) {
    emails = pickBestEmail(emailResult.emails);
    emailSource = emailResult.source;
    checkedOrigins = emailResult.checkedOrigins;
  }

  // Smart fit: which target role(s) actually fit this organization + suitability + eligibility.
  let applyFor: string[] = [];
  let droppedRoles: string[] = [];
  let fitScore = 0;
  let fitSummary = "";
  let eligibility: Eligibility = { status: "ok", note: "" };

  if (intent === "study") {
    applyFor = businessPositions.slice(0, 2);
  } else {
    const fitResult = combinedFit || separateFitResult;
    if (fitResult) {
      applyFor = fitResult.applyFor;
      droppedRoles = fitResult.droppedRoles;
      fitScore = fitResult.fitScore;
      fitSummary = fitResult.fitSummary;
      eligibility = fitResult.eligibility;
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

  // ── Cold-email detection ──────────────────────────────────────────────────
  // True when the listing has no advertised positions (speculative enquiry).
  const coldEmail = intent === "job" && businessPositions.length === 0;

  // ── Company research snippet ───────────────────────────────────────────────
  // Extract 1-2 about-the-company sentences deterministically (no AI needed).
  const companySnippet = extractCompanySnippet(text, analysis.company);

  // ── Salary intelligence ───────────────────────────────────────────────────
  const salary = getSalaryBand(
    applyFor.length ? applyFor : profile.targetRoles,
    analysis.country.code
  );

  // ── Intelligence layer (deterministic, O(n), no AI) ──────────────────────
  const skillsGap        = analyzeSkillsGap(text, profile);
  const sponsorshipSignal = detectSponsorshipSignal(text, analysis.country.code);
  const postingFreshness  = detectPostingFreshness(text);
  const whvTimeline       = assessWhvTimeline(profile.whvExpiry);
  const postingTone       = detectPostingTone(text, orgType);
  const responseRate      = predictResponseRate({
    fitScore,
    eligibilityStatus: eligibility.status,
    onSkillShortageList: visaIntelligence?.onSkillShortageList ?? false,
    sponsorshipSignal: sponsorshipSignal.signal,
    freshness: postingFreshness.label,
    needsVisaSponsorship: profile.needsVisaSponsorship,
    gapCount: skillsGap.gapSkills.length,
  });

  // Surface sponsorship-closed as an eligibility block when user needs sponsorship
  if (profile.needsVisaSponsorship && !visaCovered && sponsorshipSignal.signal === "closed" && eligibility.status === "ok") {
    eligibility = { status: "warning", note: sponsorshipSignal.note || "This employer may require existing local work rights." };
  }
  // WHV critical timeline → inject as eligibility note (lower priority than existing notes)
  if (whvTimeline.urgencyLevel === "critical" && eligibility.status === "ok" && !eligibility.note) {
    eligibility = { status: "warning", note: whvTimeline.note || "" };
  }

  // Resolve the user's remembered visa type preference for the detected country.
  // An explicit override passed via the request (profile.preferredVisaType) wins; otherwise
  // look up the stored per-country preference from profile.visaPreferences.
  const preferredVisaType: string | null =
    profile.preferredVisaType ||
    (profile.visaPreferences && analysis.country.code !== "XX"
      ? (profile.visaPreferences[analysis.country.code] ?? null)
      : null);

  // The draft targets the chosen role(s)/program(s), not the user's full wish list.
  const draftAnalysis: Analysis = { ...analysis, positions: applyFor.length ? applyFor : analysis.positions };

  // Draft: AI when configured (tier picks the model), else the smart multilingual template.
  let drafts: DraftOption[] = [];
  let draftSource: "ai" | "template" = "template";
  if (aiEnabled()) {
    // aiCoverLetter is intentionally excluded here — it ran in parallel with aiDrafts but added
    // significant AI provider load, contributing to gateway timeouts on the Hobby plan. The cover
    // letter is now generated lazily (template immediately; AI version via /api/rewrite-cover-letter
    // when the user opens the Cover Letter tab or clicks "Rewrite").
    const aiRes = await withAiSubBudget(8000, () =>
      aiDrafts({ text, analysis: draftAnalysis, profile }, language, tier, authorization, applyFor, opts.reasoningEffort, { orgType, intent }, preferredVisaType)
    );
    if (aiRes && aiRes.length) {
      drafts = aiRes;
      draftSource = "ai";
    }
  }
  if (!drafts.length) {
    const fallbackDraft = buildDraft(draftAnalysis, profile, language, authorization);
    drafts = [{
      subject: fallbackDraft.subject,
      body: fallbackDraft.body,
      style: "Balanced & Personal"
    }];
  }
  // Cover letter: always use the template in the main pipeline (fast, synchronous).
  // The AI-enhanced version is generated lazily via /api/rewrite-cover-letter.
  const coverLetterBody = buildCoverLetter(draftAnalysis, profile, language, authorization);

  return {
    analysis, emails, emailSource,
    draft: { subject: drafts[0].subject, body: drafts[0].body },
    drafts,
    draftSource, language, visaCovered, visaLabel, checkedOrigins,
    applyFor, droppedRoles, fitScore, fitSummary, eligibility,
    coverLetterBody,
    coverLetterSource: "template" as const,
    orgType, intent,
    isRecruitmentAgency: Boolean(analysis.isRecruitmentAgency),
    visaIntelligence,
    skillsGap, sponsorshipSignal, postingFreshness, whvTimeline, postingTone, responseRate,
    salary, coldEmail, companySnippet,
    preferredVisaType,
  };
}

// Extract a short company-description snippet from the raw page text.
// Scores sentences on how "about the business" they are, rejects review noise / job copy.
function extractCompanySnippet(text: string, company: string): string | null {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => {
      if (s.length < 35 || s.length > 300) return false;
      // Drop strings with repeated tokens (e.g. "GoogleGoogleGoogle", "more more more")
      if (/(\b\w{3,}\b)(?:[\s\W]+\1){2,}/i.test(s)) return false;
      // Drop reviewer metadata lines (dates like 2024-03-23, "profile picture", "Read more")
      if (/\d{4}-\d{2}-\d{2}/.test(s)) return false;
      if (/profile picture|read more|thumbs? (up|down)|👍|👎/i.test(s)) return false;
      // Drop lines that look like a list of names (≥3 proper-nouns in a short span)
      const properNouns = s.match(/\b[A-Z][a-z]+\b/g) || [];
      if (properNouns.length / s.split(/\s+/).length > 0.6) return false;
      return true;
    });

  const ABOUT_RE = /founded|established|family.?owned|award|accolade|gold list|special[iz]|known for|recogni[sz]|passionate|pride|located|since \d{4}|heritage|tradition|star.{0,10}(hotel|property|restaurant|resort)|boutique|luxury|contemporary|independent(ly)?|locally.owned|team of|years? of (experience|operation)|our (mission|vision|team|guests?|story|philosophy)|dedicated to|commit(ted|ment) to|strive|renowned|rated|reviewed/i;
  const SKIP_RE = /apply|application|cv|résumé|resume|requirement|experience required|must have|should have|will be responsible|key duties|you will|reporting to|we are looking|we (seek|require|need)|click here|submit|role description|position overview|about the role|about this (role|job|position)|equal opportunity|background check|right to work|salary range|per hour|per annum|\$\d|AUD|NZD|USD|GBP/i;

  // Score each sentence: prefer ones that mention the company name, have about-words, are well-formed
  const scored = sentences
    .filter((s) => ABOUT_RE.test(s) && !SKIP_RE.test(s))
    .map((s) => {
      let score = 0;
      if (new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(s)) score += 3;
      if (/founded|established|since \d{4}|years? of/i.test(s)) score += 2;
      if (/award|accolade|gold list|star|recogni|renown/i.test(s)) score += 2;
      if (/our (mission|vision|team|guests?|story|philosophy)|dedicated|passionate|pride/i.test(s)) score += 1;
      // Penalise very short or review-like sentences
      if (s.length < 60) score -= 1;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 2).map((x) => x.s);
  return top.length ? top.join(" ") : null;
}
