// AI layer — provider-agnostic. Uses native Anthropic, OR any OpenAI-compatible endpoint
// (OpenRouter, Groq, DeepSeek, Together, local Ollama…) selected via env. No key set → returns
// null and the caller falls back to the smart template. Email addresses are NEVER produced here:
// extraction stays deterministic (lib/engine/detect + websearch) so the "never guess emails" rule holds.
import Anthropic from "@anthropic-ai/sdk";
import type { Draft, DraftOption, GenerateInput, EngineProfile } from "./types";
import { APP_LANGS, type AppLang } from "./template";

export type AiTier = "free" | "pro";

type Resolved =
  | { kind: "anthropic"; model: string }
  | { kind: "openai"; baseUrl: string; apiKey: string; model: string };

function openaiFrom(base: string | undefined, key: string | undefined, model: string | undefined): Resolved | null {
  return key
    ? { kind: "openai", baseUrl: (base || "https://api.openai.com/v1").replace(/\/+$/, ""), apiKey: key, model: model || "gpt-4o-mini" }
    : null;
}

// Free tier: a free-but-smart provider (Groq, Gemini, …) configured via FREE_AI_*.
function freeProvider(): Resolved | null {
  return openaiFrom(process.env.FREE_AI_BASE_URL, process.env.FREE_AI_API_KEY, process.env.FREE_AI_MODEL);
}

// Pro tier: premium model. Native Anthropic if present, else a generic OpenAI-compatible AI_*/OPENAI_*.
function premiumProvider(): Resolved | null {
  if (process.env.ANTHROPIC_API_KEY) return { kind: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8" };
  return openaiFrom(
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL,
    process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
    process.env.AI_MODEL || process.env.OPENAI_MODEL
  );
}

// Resolve a provider for a tier, with graceful cross-fallback so a single configured key works everywhere.
function resolveProvider(tier: AiTier): Resolved | null {
  return tier === "pro" ? (premiumProvider() || freeProvider()) : (freeProvider() || premiumProvider());
}

export function aiEnabled(): boolean {
  return resolveProvider("free") !== null || resolveProvider("pro") !== null;
}

// One text completion for the given tier. Returns the raw assistant text, or null on any failure.
async function complete(prompt: string, maxTokens: number, tier: AiTier, reasoningEffort: "low" | "high" = "low", temperature: number = 0.4): Promise<string | null> {
  const r = resolveProvider(tier);
  if (!r) return null;
  try {
    if (r.kind === "anthropic") {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const msg = await client.messages.create({
        model: r.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    }
    const res = await fetch(`${r.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${r.apiKey}` },
      body: JSON.stringify({ model: r.model, max_tokens: maxTokens, temperature, reasoning_effort: reasoningEffort, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    return typeof out === "string" ? out.trim() : null;
  } catch {
    return null;
  }
}

function extractJson<T>(out: string | null): T | null {
  if (!out) return null;
  try {
    const a = out.indexOf("{");
    const b = out.lastIndexOf("}");
    if (a < 0 || b < 0) return null;
    return JSON.parse(out.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}

// ---------- Smart structured understanding of the pasted business text ----------
export type AiAnalysis = {
  company?: string;
  countryCode?: string; // NZ | AU | US | CA | UK | XX
  language?: AppLang;
  positions?: string[];
};

export async function aiAnalyze(text: string, tier: AiTier = "free"): Promise<AiAnalysis | null> {
  if (!aiEnabled()) return null;
  const prompt = `You are the analysis engine of a job-application assistant. A user pasted RAW text scraped from a business's website — it may contain navigation menus, repeated/duplicated logo text, cookie banners and marketing copy. Read it like a careful human and return clean structured facts.

Return STRICT JSON ONLY, no prose, exactly these keys:
{
  "company": "the clean human brand name only (deduplicate repeated logo text, drop street address, menu items, taglines and 'Website by ...')",
  "countryCode": "ISO 3166-1 alpha-2 code for the destination country: one of NZ, AU, US, CA, UK, DE, ES, FR, IT, NL, PT, IE, AT, CH, GR, SE, DK, NO, BE, FI, CZ, PL — or XX if genuinely unknown. Infer from postal address, phone country/area code, email TLD (.co.nz, .com.au, .co.uk, .ca, .de, .es, .fr, .it, .nl, .pt, .be, .fi, .cz, .pl), and city names.",
  "language": "the language the application email should be written in to best match this business: one of en, tr, es, fr, de, it, pt",
  "positions": ["1-3 realistic hospitality roles to apply for, inferred from the venue type (hotel/restaurant/cafe/bar) if none are explicitly advertised"]
}

Critical rules:
- DEDUPLICATE the brand: if the text shows "Hotel MontrealHotel Montreal" return "Hotel Montreal".
- The NAME can be misleading: a business in New Zealand / Australia / USA / UK / English-Canada is "en" even if its name sounds foreign (e.g. "Hotel Montreal" in Christchurch, New Zealand → countryCode NZ, language en).
- Output NO email addresses and invent NOTHING. Only the four keys above.

Business text:
"""
${text.slice(0, 6000)}
"""`;

  const parsed = extractJson<AiAnalysis>(await complete(prompt, 400, tier));
  if (!parsed) return null;
  const langs = APP_LANGS.map((l) => l.code) as string[];
  return {
    company: typeof parsed.company === "string" && parsed.company.trim() ? parsed.company.trim().slice(0, 120) : undefined,
    countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) : undefined,
    language: typeof parsed.language === "string" && langs.includes(parsed.language) ? (parsed.language as AppLang) : undefined,
    positions: Array.isArray(parsed.positions)
      ? parsed.positions.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 4)
      : undefined,
  };
}

// ---------- Fit assessment: which roles to apply for + suitability + eligibility ----------
export type Eligibility = { status: "ok" | "warning" | "blocked"; note: string };
export type FitAssessment = {
  applyFor: string[];      // the 1-2 roles actually worth applying for at THIS business
  droppedRoles: string[];  // target roles that don't fit this business
  fitScore: number;        // 0-100 how well the applicant matches what this business needs
  fitSummary: string;      // one human sentence shown to the user
  eligibility: Eligibility;
};

// One LLM call that decides role best-fit, scores suitability, and reads any hard eligibility
// constraint the listing states (work rights / no sponsorship / residents only). Crosses these
// with the applicant's own visa situation. Invents nothing — eligibility notes only come from the text.
export async function aiAssessFit(opts: {
  text: string;
  company: string;
  countryName: string;
  countryVisa: string;           // e.g. "Accredited Employer Work Visa (AEWV)"
  businessPositions: string[];   // what the page seems to offer
  profile: EngineProfile;
  lang?: AppLang;
  tier?: AiTier;
}): Promise<FitAssessment | null> {
  if (!aiEnabled()) return null;
  const { profile } = opts;
  const langName = APP_LANGS.find((l) => l.code === (opts.lang || "en"))?.label || "English";
  const visaLine = profile.hasVisa
    ? `Already holds work authorization for: ${(profile.visaCountries || []).join(", ") || "(unspecified)"}${profile.visaLabel ? ` (${profile.visaLabel})` : ""}.`
    : profile.needsVisaSponsorship
    ? `Needs visa sponsorship to work in ${opts.countryName} (${opts.countryVisa}).`
    : `Does not need visa sponsorship.`;

  const cvSection = profile.cvText
    ? `\nCV / RESUME (extracted text — use this to score experience accurately):\n"""\n${profile.cvText.slice(0, 3000)}\n"""`
    : "";

  // Build a deterministic prompt with strict rubric-based scoring so the same inputs always produce the same result.
  const prompt = `You are the deterministic matching engine of a job-application assistant. Your output must be EXACTLY
reproducible: given the same inputs, you MUST return the same JSON every time. Do NOT introduce any randomness.

Determine which of the applicant's target roles fit THIS specific business, calculate the fit score using the
STRICT RUBRIC below, and flag any hard eligibility constraint the listing itself states.

APPLICANT
- Target roles (wish list): ${profile.targetRoles.join(", ") || "(none set)"}
- Languages: ${profile.languages.join(", ") || "(unspecified)"}
- Open to relocating: ${profile.relocation ? "yes" : "no"}
${profile.shortBio ? `- Bio: ${profile.shortBio}\n` : ""}- Work eligibility: ${visaLine}${cvSection}

THE BUSINESS
- Name: ${opts.company}
- Country: ${opts.countryName}
- Roles it appears to offer: ${opts.businessPositions.join(", ") || "(not explicitly stated — infer from the venue type)"}

RAW PAGE TEXT:
"""
${opts.text.slice(0, 5000)}
"""

=== STRICT SCORING RUBRIC (use this EXACTLY — do NOT deviate) ===
Calculate fitScore by summing these components:

1. ROLE MATCH (0-35 points)
   - 35: At least one target role is an exact or near-exact match for what the business offers
   - 25: Target role is in the same job family (e.g. "Front Desk" at a hotel offering "Receptionist")
   - 15: Target role is loosely related to the business type (e.g. "Waiter" at a restaurant, but listing doesn't mention waiter)
   - 5: Target role has minimal relevance to this business
   - 0: No target role fits this business at all

2. EXPERIENCE & SKILLS (0-25 points)
   - 25: CV/bio shows direct relevant experience for the matched role(s)
   - 15: CV/bio shows transferable experience from a related field
   - 8: CV/bio shows some general work experience but not in this field
   - 0: No relevant experience evident or no CV provided

3. LANGUAGE FIT (0-15 points)
   - 15: Applicant speaks the primary language of the business's country
   - 10: Applicant speaks English and the business is in a non-English country (English likely useful)
   - 5: Applicant speaks a language somewhat common in the country
   - 0: No language overlap evident

4. LOCATION & LOGISTICS (0-15 points)
   - 15: Applicant is in the same country or city, or no location barriers
   - 10: Applicant is willing to relocate and relocation is feasible
   - 5: Relocation possible but uncertain
   - 0: Significant location barriers and applicant is not open to relocating

5. WORK AUTHORIZATION (0-10 points)
   - 10: Applicant already has work authorization for this country
   - 5: Sponsorship needed but listing doesn't explicitly exclude it
   - 0: Listing explicitly requires existing work rights and applicant doesn't have them

fitScore = sum of all 5 components (0-100).

Return STRICT JSON ONLY, exactly these keys:
{
  "applyFor": ["ALL of the applicant's target roles that genuinely fit this business — keep every role that the venue plausibly employs. E.g. a hotel with a restaurant keeps BOTH Front Desk AND Waiter. Only drop roles that are truly incompatible (e.g. Night Audit at a standalone café). If none fit, suggest the single most realistic role for this venue type."],
  "droppedRoles": ["target roles that clearly do NOT fit this business, e.g. lodging-only roles at a standalone restaurant"],
  "fitScore": <number: sum from rubric above>,
  "fitSummary": "ONE short sentence in ${langName}, addressed to the applicant, listing all roles being applied for and why they fit.",
  "eligibility": {
    "status": "ok | warning | blocked",
    "note": "If the listing explicitly requires something the applicant may not meet (valid work rights / no sponsorship offered / citizens or residents only / specific local license), state it in ${langName} and what it means for them. Otherwise empty string."
  }
}

Rules:
- applyFor: include ALL of the applicant's roles that this venue can plausibly employ. Hotels employ both lodging AND food/bar staff — keep all applicable roles. Only drop roles that are structurally incompatible (accommodation roles at a standalone restaurant/café/bar).
- Prefer the applicant's own role wording exactly.
- eligibility.note ONLY from explicit text in the page. If the page says nothing restrictive, status "ok" and note "".
- If the applicant needs sponsorship AND the listing says no sponsorship / must already have work rights → status "blocked".
- If it's implied or country-typical but not stated → status "warning" at most. Never invent a constraint.
- CRITICAL: Be deterministic. Same inputs = same output. Do not vary your assessment.`;

  const parsed = extractJson<Partial<FitAssessment>>(await complete(prompt, 600, opts.tier || "free", "low", 0));
  if (!parsed) return null;
  const clampStr = (a: unknown): string[] =>
    Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 4) : [];
  const elig = (parsed.eligibility || {}) as Partial<Eligibility>;
  const status: Eligibility["status"] = elig.status === "blocked" || elig.status === "warning" ? elig.status : "ok";
  return {
    applyFor: clampStr(parsed.applyFor),
    droppedRoles: clampStr(parsed.droppedRoles),
    fitScore: typeof parsed.fitScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.fitScore))) : 0,
    fitSummary: typeof parsed.fitSummary === "string" ? parsed.fitSummary.trim().slice(0, 300) : "",
    eligibility: { status, note: typeof elig.note === "string" ? elig.note.trim().slice(0, 300) : "" },
  };
}

// ---------- Visa document understanding ----------
export type AiVisaAnalysis = {
  visaTypeId?: string; // matches a VISA_TYPES id (eu_work | schengen | es_work | ... | custom)
  label?: string;      // human label, e.g. "Spain work and residence permit"
  countries?: string[]; // ISO alpha-2 codes the visa authorizes work in
};

export async function aiAnalyzeVisa(text: string, tier: AiTier = "free"): Promise<AiVisaAnalysis | null> {
  if (!aiEnabled()) return null;
  const prompt = `You read a residence/work visa or permit document (OCR/extracted text, possibly messy) and return which countries it authorizes the holder to WORK in.

Return STRICT JSON ONLY, exactly these keys:
{
  "visaTypeId": "one of: eu_work, schengen, es_work, de_work, fr_work, it_work, nl_work, pt_work, ie_work, uk_work, us_work, ca_work, au_work, nz_work, custom",
  "label": "a short human label for the visa, e.g. 'Spain work and residence permit' or 'EU Blue Card'",
  "countries": ["ISO 3166-1 alpha-2 codes the document grants WORK rights in"]
}

Guidance:
- A single-country national work/residence permit → that country's *_work id and just that country code (e.g. Spain → es_work, ["ES"]).
- An EU Blue Card or EU long-term work permit → eu_work.
- A Schengen visa (short-stay) → schengen, but only if it actually conveys work rights; otherwise still report it as schengen and let the user decide.
- If unsure of the exact preset, use "custom" and still fill countries with your best read.
- Output codes only for countries genuinely indicated by the document. Invent nothing.

Document text:
"""
${text.slice(0, 4000)}
"""`;
  const parsed = extractJson<AiVisaAnalysis>(await complete(prompt, 300, tier));
  if (!parsed) return null;
  return {
    visaTypeId: typeof parsed.visaTypeId === "string" ? parsed.visaTypeId.trim() : undefined,
    label: typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim().slice(0, 80) : undefined,
    countries: Array.isArray(parsed.countries)
      ? parsed.countries.filter((x): x is string => typeof x === "string").map((x) => x.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)).filter(Boolean)
      : undefined,
  };
}

// ---------- Follow-up generation ----------
export async function aiFollowup(opts: {
  company: string;
  country?: string;
  roles?: string[];
  originalSubject?: string;
  lang: AppLang;
  tier?: AiTier;
}): Promise<Draft | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === opts.lang)?.label || "English";
  const prompt = `Write a SHORT, polite follow-up email for a job application that hasn't received a reply yet.

Context:
- Company: ${opts.company}
${opts.country ? `- Country: ${opts.country}\n` : ""}${opts.roles?.length ? `- Roles applied for: ${opts.roles.join(", ")}\n` : ""}${opts.originalSubject ? `- Original subject: ${opts.originalSubject}\n` : ""}
Write fully IN ${langName}. Return STRICT JSON only: {"subject": "...", "body": "..."}.

Rules:
- Warm, brief (60-90 words), not pushy. Reference that you applied recently and reiterate genuine interest.
- Subject: plain text, references the follow-up. NO "SUBJECT:" prefix.
- NO closing salutation/name/signature block (the Gmail signature is appended automatically).
- Invent no new facts.`;
  const parsed = extractJson<Partial<Draft>>(await complete(prompt, 500, opts.tier || "free"));
  if (parsed?.subject && parsed?.body) return { subject: parsed.subject, body: parsed.body };
  return null;
}

// ---------- Alternative subject variant ----------
export async function aiSubjectVariant(
  subject: string,
  company: string,
  positions: string[],
  lang: AppLang = "en",
  tier: AiTier = "free"
): Promise<string | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";
  const prompt = `A job applicant is sending an application email to "${company}" for roles: ${positions.join(", ") || "hospitality"}.
The original subject line is: "${subject}"

Write ONE alternative subject line that takes a different angle (e.g., if the original is specific/formal, make this one warmer/shorter, or vice-versa). Write fully IN ${langName}. Return STRICT JSON only: {"subject": "..."}.

Rules:
- Plain text, no "SUBJECT:" prefix.
- No more than 10 words.
- Don't repeat the original word-for-word.
- Invent nothing not implied by the roles or company.`;
  const parsed = extractJson<{ subject?: string }>(await complete(prompt, 300, tier));
  if (parsed?.subject && typeof parsed.subject === "string") return parsed.subject.trim().slice(0, 160);
  return null;
}

// ---------- One-tap body refinement ----------
export type RefineAction = "shorter" | "warmer" | "formal" | "regenerate";

const REFINE_INSTRUCTION: Record<RefineAction, string> = {
  shorter: "Make it noticeably more concise — cut roughly a third of the length while keeping every key point and the visa statement. Tighten sentences, remove filler.",
  warmer: "Make the tone warmer, more personable and human — still professional, never gushing. Keep the same facts and structure.",
  formal: "Make the tone more formal, polished and precise — the register a careful hiring manager respects. Keep the same facts.",
  regenerate: "Rewrite it fresh: a different opening line and different phrasing throughout, but the SAME facts, intent, roles and visa stance.",
};

export async function aiRefine(opts: {
  body: string;
  action: RefineAction;
  company?: string;
  lang: AppLang;
  tier?: AiTier;
}): Promise<string | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === opts.lang)?.label || "English";
  const prompt = `You are refining the BODY of a job-application email. Apply this change: ${REFINE_INSTRUCTION[opts.action]}

Write fully IN ${langName}. Return STRICT JSON only: {"body": "..."}.

Hard rules (follow exactly):
- Keep it a single email body. Preserve the visa/sponsorship statement if one is present.
- NO "Sincerely"/"Kind regards"/any closing salutation, NO applicant name, email, phone or signature block — a Gmail signature is appended automatically.
- Invent NOTHING new — no email addresses, no facts not already in the text${opts.company ? ` about ${opts.company}` : ""}. No clichés, no fake urgency.

Current body:
"""
${opts.body.slice(0, 4000)}
"""`;
  const parsed = extractJson<{ body?: string }>(await complete(prompt, 900, opts.tier || "free"));
  if (parsed?.body && typeof parsed.body === "string" && parsed.body.trim()) return parsed.body.trim();
  return null;
}


// ---------- Custom Cover Letter generation ----------
export async function aiCoverLetter(
  { text, analysis, profile }: GenerateInput,
  lang: AppLang = "en",
  tier: AiTier = "free",
  applyForRoles?: string[]
): Promise<string | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";
  const rolesForThisJob = (applyForRoles && applyForRoles.length ? applyForRoles : analysis.positions).filter(Boolean);
  const rolesLine = rolesForThisJob.join(", ") || "Hospitality";

  const cvSection = profile.cvText
    ? `\nAPPLICANT CV (extract concrete experience, past employers, job titles, and skills — weave these into the cover letter to make it specific and compelling):\n"""\n${profile.cvText.slice(0, 3500)}\n"""`
    : "";

  const prompt = `You are a professional CV and Cover Letter writer. Write a formal, outstanding Cover Letter for ${profile.fullName || "the applicant"} applying to "${analysis.company}" in ${analysis.country.name} for the roles: ${rolesLine}.

APPLICANT INFO:
- Name: ${profile.fullName || "the applicant"}
- Target Roles: ${rolesLine}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
- Relocation: ${profile.relocation ? "Yes" : "No"}
${profile.shortBio ? `- Bio: ${profile.shortBio}\n` : ""}- Work eligibility: ${profile.needsVisaSponsorship ? "Requires visa sponsorship" : "Work authorized"}${cvSection}

THE BUSINESS:
- Company: ${analysis.company}
- Location: ${analysis.country.name}

RAW TEXT FROM JOB LISTING / WEBSITE:
"""
${text.slice(0, 4000)}
"""

Write the cover letter fully in ${langName} at native speaker quality.
Return STRICT JSON only: {"body": "..."}.

Rules for the cover letter:
- Write ONLY the main body paragraphs of the cover letter.
- Do NOT include applicant details, date, company address, greeting (like 'Dear hiring manager'), or closing sign-off (like 'Sincerely, [Name]'). Those will be added automatically by the docx formatter.
- Structure it professionally into 3 paragraphs:
  1. Introduction: State interest in the role at the specific company, demonstrating genuine enthusiasm. Reference some details of their venue or brand.
  2. Experience/Why Me: Map the applicant's background, bio, and languages to the specific business needs.
  3. Conclusion: Reiterate interest, state that the resume/CV is enclosed (do NOT mention email attachments since this is a document), and express interest in discussing further.
- Keep it concise, formal yet engaging, and highly customized. Invent no fake details.`;

  const parsed = extractJson<{ body?: string }>(await complete(prompt, 1000, tier));
  return parsed?.body || null;
}

// ---------- Draft generation ----------
export async function aiDrafts(
  { text, analysis, profile }: GenerateInput,
  lang: AppLang = "en",
  tier: AiTier = "free",
  authorization?: { authorized: boolean; visaLabel?: string | null },
  applyForRoles?: string[],
  reasoningEffort: "low" | "high" = "low"
): Promise<DraftOption[] | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";
  const rolesForThisJob = (applyForRoles && applyForRoles.length ? applyForRoles : analysis.positions).filter(Boolean);
  const rolesLine = rolesForThisJob.join(", ") || "Hospitality (infer suitable roles from the page)";

  const sponsorship = authorization?.authorized
    ? `IMPORTANT — the applicant ALREADY HOLDS a valid ${authorization.visaLabel || "work authorization"} that permits them to work in ${analysis.country.name}. They do NOT need any sponsorship. State this clearly and positively as a major advantage: they are legally able to start without the employer arranging or paying for a visa, and they are immediately available. Do NOT ask for sponsorship.`
    : profile.needsVisaSponsorship
    ? `The applicant REQUIRES visa sponsorship to work in ${analysis.country.name} (${analysis.country.visa}). State this transparently and confidently — never apologetically.`
    : `The applicant does not need visa sponsorship; do not mention visas.`;

  let thinkingInstruction = "";
  if (reasoningEffort === "high") {
    thinkingInstruction = "\n\nDEEP REASONING MODE: Please analyze the job listing thoroughly. Think deeply about the culture, requirements, and how the applicant's profile maps to it. Craft drafts that show a profound understanding of the venue's brand and look extremely tailored, mature, and professional.";
  }

  const cvSection = profile.cvText
    ? `\nAPPLICANT CV (use specific details — job titles, employers, dates, skills — to make the email concrete and tailored):\n"""\n${profile.cvText.slice(0, 3000)}\n"""`
    : "";

  const prompt = `You write outstanding, human job-application emails — the kind a hiring manager actually replies to. Write THREE distinct application emails for ${profile.fullName || "the applicant"}.

Each draft should have a different style/angle:
1. "Balanced & Personal": Warm-professional, natural, friendly yet polite. (Excellent baseline).
2. "Short & Direct": Focused and high-impact. Perfect for busy managers.
3. "Skills & Bio Focused": Highlights the applicant's relevant experience, short bio, and languages.

APPLICANT
- Applying specifically for: ${rolesLine}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
- Open to relocating: ${profile.relocation ? "yes" : "no"}
${profile.shortBio ? `- Bio: ${profile.shortBio}\n` : ""}- ${sponsorship}${cvSection}${thinkingInstruction}

THE BUSINESS (already analyzed)
- Company: ${analysis.company}
- Country: ${analysis.country.name}

RAW PAGE TEXT (for concrete, specific detail — reference something real about this venue, not generic flattery):
"""
${text.slice(0, 4000)}
"""

Write the emails fully IN ${langName} (subject AND body), at native-speaker quality.
Return STRICT JSON only, with a "drafts" array containing exactly three items, each having "style", "subject", and "body" keys:
{
  "drafts": [
    { "style": "Balanced & Personal", "subject": "...", "body": "..." },
    { "style": "Short & Direct", "subject": "...", "body": "..." },
    { "style": "Skills & Bio Focused", "subject": "...", "body": "..." }
  ]
}

Hard rules (follow exactly):
- Apply ONLY for the role(s) listed under "Applying specifically for". If multiple roles are listed (e.g. "Front Desk, Waiter"), mention ALL of them — the applicant is qualified for each and the business employs all of them.
- Subject: plain text, NO "SUBJECT:" prefix; specific, not generic. If multiple roles, list them all (e.g. "Front Desk & Waiter Application").
- Body: concise. Reference the company by name and one concrete, true detail from the page. State the visa sponsorship need transparently if required. Mention the languages naturally. Note that the CV is attached.
- NO "Sincerely"/"Kind regards"/any closing salutation, NO applicant name, email, phone, or signature block — a Gmail signature is appended automatically.
- Invent NOTHING — no email addresses, no facts not supported by the page or applicant profile. No clichés, no fake urgency.`;

  const parsed = extractJson<{ drafts?: DraftOption[] }>(await complete(prompt, 1800, tier, reasoningEffort));
  if (parsed?.drafts && Array.isArray(parsed.drafts) && parsed.drafts.length === 3) {
    return parsed.drafts;
  }
  return null;
}

// ---------- Deep Cover Letter Rewrite ----------
export async function aiRewriteCoverLetter(opts: {
  currentCoverLetter: string;
  jobText: string;
  company: string;
  positions: string[];
  applicantName?: string;
  applicantBio?: string;
  applicantLanguages?: string[];
  needsVisaSponsorship?: boolean;
  openToRelocation?: boolean;
  cvText?: string | null;
  lang: AppLang;
  tier?: AiTier;
}): Promise<string | null> {
  if (!aiEnabled()) return null;

  const langName = APP_LANGS.find((l) => l.code === opts.lang)?.label || "English";
  const rolesLine = opts.positions.filter(Boolean).join(", ") || "the advertised role";

  const applicantLines = [
    opts.applicantName ? `- Full Name: ${opts.applicantName}` : null,
    opts.applicantBio ? `- Professional Background: ${opts.applicantBio}` : null,
    opts.applicantLanguages?.length ? `- Languages: ${opts.applicantLanguages.join(", ")}` : null,
    opts.needsVisaSponsorship ? `- Work Authorization: Requires visa sponsorship` : `- Work Authorization: Authorized to work, no sponsorship needed`,
    opts.openToRelocation ? `- Relocation: Open to relocation` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const cvSection = opts.cvText
    ? `\nAPPLICANT CV (use specific job titles, employers, dates, skills from here):\n"""\n${opts.cvText.slice(0, 3000)}\n"""`
    : "";

  const prompt = `You are an elite Cover Letter writer. Your task is to DEEPLY REWRITE and dramatically IMPROVE the cover letter below.

APPLICANT PROFILE:
${applicantLines || "(profile not available)"}${cvSection}

COMPANY: ${opts.company || "(not specified)"}
TARGET ROLES: ${rolesLine}

JOB LISTING / CONTEXT (use this to tailor the letter specifically):
"""
${opts.jobText.slice(0, 5000)}
"""

CURRENT COVER LETTER (study this and improve upon it):
"""
${opts.currentCoverLetter.slice(0, 3000)}
"""

INSTRUCTIONS:
- Write a SIGNIFICANTLY BETTER, deeply tailored cover letter using the job listing context.
- Mirror the company's language, values, and specific requirements from the job listing.
- Map the applicant's specific background to exactly what this company needs.
- Reference concrete details from the job listing (venue type, specific requirements, company culture).
- Structure into 3 compelling paragraphs:
  1. Opening: Genuine enthusiasm with a specific reason for THIS company/role, not generic flattery.
  2. Body: Powerfully connect applicant's skills/experience to the job's specific requirements and culture.
  3. Closing: Express availability, mention CV/resume is attached (NOT email attachment), invite next steps.
- Write ONLY the main body paragraphs. Do NOT include: date, applicant name/address, company address, salutation ("Dear..."), or sign-off ("Sincerely..."). Those are added automatically.
- Write fully in ${langName} at native speaker quality.
- Be specific, compelling, and avoid generic phrases like "I am a motivated individual".
- Return STRICT JSON only: {"body": "..."}`;

  const parsed = extractJson<{ body?: string }>(await complete(prompt, 1200, opts.tier || "free"));
  if (parsed?.body && typeof parsed.body === "string" && parsed.body.trim()) {
    return parsed.body.trim();
  }
  return null;
}
