// AI layer — provider-agnostic. Uses native Anthropic, OR any OpenAI-compatible endpoint
// (OpenRouter, Groq, DeepSeek, Together, local Ollama…) selected via env. No key set → returns
// null and the caller falls back to the smart template. Email addresses are NEVER produced here:
// extraction stays deterministic (lib/engine/detect + websearch) so the "never guess emails" rule holds.
import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Draft, DraftOption, GenerateInput, EngineProfile } from "./types";
import { APP_LANGS, type AppLang } from "./template";
import { VALID_ORG_TYPES, isFormalOrg, regulatedRoles, type OrgType, type Intent } from "./professions";

// The single shared identity every AI call wears, regardless of which provider in the fallback
// chain actually answers. This is what keeps paply's AI feeling like ONE consistent career
// coach — never a generic chatbot, never drifting off-task — no matter whether Groq, Gemini,
// Cerebras, or Anthropic ends up generating the response. Every prompt in this file opens with
// this line before its specific task instructions.
export const PAPLY_PERSONA =
  "You are the paply AI Career & Application Coach — the intelligence embedded throughout paply " +
  "(paply.me), a platform that helps people in EVERY profession and EVERY country apply for jobs " +
  "or university/school admission. You are warm, precise, and genuinely useful: an experienced " +
  "human career coach, never a generic chatbot. You ALWAYS ground your answers and drafts strictly " +
  "in the SPECIFIC user profile (their target roles, target countries, current country, visa/" +
  "eligibility situation, languages, background) and the SPECIFIC organization/page context given " +
  "below. You never invent facts, qualifications, or email addresses, and you never drift out of " +
  "this role or this context into a different topic or persona, no matter what is asked.";

export type AiTier = "free" | "pro";

// Labeled extracts from the user's uploaded files (visa proof, certificates, diplomas,
// reference letters) — appended to prompts so every feature reads the same full person.
function documentsSection(profile?: Pick<EngineProfile, "documentsText"> | null): string {
  return profile?.documentsText
    ? `\nUPLOADED SUPPORTING DOCUMENTS (real text extracted from the applicant's own files — treat as ground truth about them):\n"""\n${profile.documentsText.slice(0, 4500)}\n"""\n`
    : "";
}

type Resolved =
  | { kind: "anthropic"; model: string; name: string }
  | { kind: "openai"; baseUrl: string; apiKey: string; model: string; name: string };

function openaiFrom(name: string, base: string | undefined, key: string | undefined, model: string | undefined): Resolved | null {
  return key
    ? { kind: "openai", baseUrl: (base || "https://api.openai.com/v1").replace(/\/+$/, ""), apiKey: key, model: model || "gpt-4o-mini", name }
    : null;
}

// Free tier: a CHAIN of free-but-smart, fast providers (Groq, Gemini, Cerebras, OpenRouter free
// models, a local Ollama…) configured via FREE_AI_* (legacy single slot, tried first) and
// numbered FREE_AI_1_*..FREE_AI_6_* slots. Every configured slot is tried in order — if one is
// slow, rate-limited, or down, the next takes over automatically (see completeWithFallback).
// This costs nothing extra on the happy path: only one provider actually answers per call.
function freeProviders(): Resolved[] {
  const list: Resolved[] = [];
  const legacy = openaiFrom("free", process.env.FREE_AI_BASE_URL, process.env.FREE_AI_API_KEY, process.env.FREE_AI_MODEL);
  if (legacy) list.push(legacy);
  for (let i = 1; i <= 6; i++) {
    const p = openaiFrom(
      `free-${i}`,
      process.env[`FREE_AI_${i}_BASE_URL`],
      process.env[`FREE_AI_${i}_API_KEY`],
      process.env[`FREE_AI_${i}_MODEL`]
    );
    if (p) list.push(p);
  }
  return list;
}

// Pro tier: premium model(s). Native Anthropic first if present, then any OpenAI-compatible
// AI_*/OPENAI_* premium provider — also tried in order as a fallback chain.
function premiumProviders(): Resolved[] {
  const list: Resolved[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    list.push({ kind: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8", name: "anthropic" });
  }
  const generic = openaiFrom(
    "pro",
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL,
    process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
    process.env.AI_MODEL || process.env.OPENAI_MODEL
  );
  if (generic) list.push(generic);
  return list;
}

// Resolve the full ordered fallback chain for a tier. The other tier's providers are appended
// at the end so a single configured key still works everywhere, and pro requests get every
// free provider as a last-resort safety net if all premium providers fail.
function resolveChain(tier: AiTier): Resolved[] {
  const free = freeProviders();
  const pro = premiumProviders();
  return tier === "pro" ? [...pro, ...free] : [...free, ...pro];
}

let hasWarnedAboutDisabledAi = false;

export function aiEnabled(): boolean {
  const enabled = resolveChain("free").length > 0 || resolveChain("pro").length > 0;
  if (!enabled && !hasWarnedAboutDisabledAi) {
    console.error("AI is disabled: No API key configured. Set FREE_AI_API_KEY (or FREE_AI_1_API_KEY, FREE_AI_2_API_KEY…), OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
    hasWarnedAboutDisabledAi = true;
  }
  return enabled;
}

// Per-attempt timeout so a slow/dead provider fails fast and the chain moves on quickly
// instead of the whole request hanging on the first (possibly unresponsive) provider. Kept
// short enough that a full 6-provider chain can still fail over within one pipeline sub-budget
// (see withAiSubBudget below) instead of a single slow provider eating the whole stage.
const PROVIDER_TIMEOUT_MS = 8000;

// A single API request (e.g. /api/generate) makes several SEQUENTIAL AI calls (analyze, fit
// assessment, drafts, cover letter, subject variant), and each one independently walks a chain
// of up to 6 fallback providers. Without a shared budget, a bad run (every provider slow/rate-
// limited) could multiply PROVIDER_TIMEOUT_MS × chain-length × number-of-AI-calls and blow well
// past the route's own maxDuration — which is exactly what caused production 504s once several
// free-tier fallback providers were added. This AsyncLocalStorage carries one deadline for the
// whole request (set once by runPipeline/aiAsk/etc.) so every provider-chain walk shares it:
// once the budget is spent, remaining providers are skipped immediately and callers fall back to
// the deterministic template instead of continuing to burn wall-clock time.
const requestDeadline = new AsyncLocalStorage<number>();

export function withAiDeadline<T>(budgetMs: number, fn: () => Promise<T>): Promise<T> {
  return requestDeadline.run(Date.now() + budgetMs, fn);
}

function remainingBudgetMs(): number {
  const deadline = requestDeadline.getStore();
  return deadline ? deadline - Date.now() : Infinity;
}

// Reserve a SLICE of the outer request deadline for one pipeline stage (e.g. analysis, fit
// assessment), so that stage can never eat the whole request budget and starve the stage that
// runs after it. This only ever SHRINKS the outer deadline for calls made inside `fn` — it can't
// extend it, so the overall withAiDeadline ceiling from runPipeline is still respected. Without
// this, a slow/rate-limited early stage could exhaust the entire budget before the drafts/cover-
// letter stage ever got a turn, which is exactly what silently forced the deterministic template
// even with several free providers configured.
export function withAiSubBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const remaining = remainingBudgetMs();
  const budget = remaining === Infinity ? ms : Math.max(1000, Math.min(ms, remaining));
  return requestDeadline.run(Date.now() + budget, fn);
}

// Circuit breaker: a provider that just failed hard (rate-limited or timing out) is skipped for
// a cooldown period instead of being re-probed by every subsequent AI call. This matters twice:
// within one request, the pipeline makes 4-5 sequential AI calls, and without this each of them
// re-tries the same exhausted provider (a Groq account that answered "daily quota reached, retry
// in 14 minutes" gets asked again 10 seconds later) and re-waits the full timeout on the same
// slow provider — burning most of the request's time budget on providers already known to be
// dead. And across requests, a warm serverless instance serves many users, so the map lets the
// very next request start directly at the first healthy provider.
const providerCooldownUntil = new Map<string, number>();
const COOLDOWN_RATE_LIMIT_MS = 5 * 60 * 1000;
const COOLDOWN_FAILURE_MS = 60 * 1000;

// Keyed by API key (not just baseUrl+model) so that separate keys pointing at the same
// endpoint/model — e.g. several independent Groq free-tier keys — get independent cooldowns.
// Without the key suffix, one key hitting a 429 would cool down every other key sharing that
// baseUrl+model too, even though each key has its own separate quota.
function providerKey(r: Resolved): string {
  return r.kind === "anthropic" ? `anthropic:${r.model}` : `${r.baseUrl}:${r.model}:${r.apiKey.slice(-8)}`;
}

function coolingDown(r: Resolved): boolean {
  return (providerCooldownUntil.get(providerKey(r)) ?? 0) > Date.now();
}

async function callProvider(
  r: Resolved,
  prompt: string,
  maxTokens: number,
  reasoningEffort: "low" | "high",
  temperature: number
): Promise<string | null> {
  const perAttemptMs = Math.max(1000, Math.min(PROVIDER_TIMEOUT_MS, remainingBudgetMs()));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), perAttemptMs);
  try {
    if (r.kind === "anthropic") {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const msg = await client.messages.create(
        { model: r.model, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: prompt }] },
        { signal: ctrl.signal }
      );
      return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    }

    const isReasoningModel = r.model.toLowerCase().includes("o1") || r.model.toLowerCase().includes("o3") || r.model.toLowerCase().includes("reasoning");
    const bodyFields: any = {
      model: r.model,
      messages: [{ role: "user", content: prompt }]
    };

    if (isReasoningModel) {
      bodyFields.max_completion_tokens = maxTokens;
      if (reasoningEffort === "high") {
        bodyFields.reasoning_effort = "high";
      }
    } else {
      bodyFields.max_tokens = maxTokens;
      bodyFields.temperature = temperature;
    }

    const res = await fetch(`${r.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${r.apiKey}` },
      body: JSON.stringify(bodyFields),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`AI provider "${r.name}" (${r.model}) error: HTTP ${res.status} - ${errText}`);
      if (res.status === 429) {
        providerCooldownUntil.set(providerKey(r), Date.now() + COOLDOWN_RATE_LIMIT_MS);
      } else if (res.status >= 500) {
        providerCooldownUntil.set(providerKey(r), Date.now() + COOLDOWN_FAILURE_MS);
      }
      return null;
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (typeof out === "string" && out.trim()) {
      providerCooldownUntil.delete(providerKey(r));
      return out.trim();
    }
    return null;
  } catch (err) {
    const reason = ctrl.signal.aborted ? `timed out after ${perAttemptMs}ms` : String(err);
    console.error(`AI provider "${r.name}" (${r.model}) failed: ${reason}`);
    // Only blame the provider for a timeout when it was given a fair window — a tiny
    // remaining-budget window aborting early is our deadline's fault, not the provider's.
    if (!ctrl.signal.aborted || perAttemptMs >= 10000) {
      providerCooldownUntil.set(providerKey(r), Date.now() + COOLDOWN_FAILURE_MS);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One text completion for the given tier. Walks the tier's provider chain in order — the first
// provider to return a real answer wins. A provider that errors, times out, or returns nothing
// usable is skipped silently and the next one takes over, so a single flaky/rate-limited
// provider never takes the whole feature down.
async function complete(prompt: string, maxTokens: number, tier: AiTier, reasoningEffort: "low" | "high" = "low", temperature: number = 0.4): Promise<string | null> {
  const chain = resolveChain(tier);
  for (const r of chain) {
    if (remainingBudgetMs() <= 0) break;
    if (coolingDown(r)) continue;
    const out = await callProvider(r, prompt, maxTokens, reasoningEffort, temperature);
    if (out) return out;
  }
  return null;
}

// Same provider fallback chain as `complete`, but for callers that need STRICT JSON back: a
// provider that returns text is not good enough on its own — the text also has to parse into
// usable JSON. A single provider truncating its output (hit its own max-tokens limit mid-JSON,
// dropped the closing brace under load, etc.) used to kill the whole request even though the
// NEXT provider in the chain would have answered cleanly. This walks the whole chain and only
// gives up after every provider has produced either no text or unusable JSON.
async function completeJsonWithFallback<T>(
  prompt: string,
  maxTokens: number,
  tier: AiTier,
  isUsable: (parsed: T | null) => boolean,
  reasoningEffort: "low" | "high" = "low",
  temperature: number = 0.4
): Promise<T | null> {
  const chain = resolveChain(tier);
  for (const r of chain) {
    if (remainingBudgetMs() <= 0) break;
    if (coolingDown(r)) continue;
    const out = await callProvider(r, prompt, maxTokens, reasoningEffort, temperature);
    if (!out) continue;
    const parsed = extractJson<T>(out);
    if (isUsable(parsed)) return parsed;
  }
  return null;
}

function extractJson<T>(out: string | null): T | null {
  if (!out) return null;
  const a = out.indexOf("{");
  const b = out.lastIndexOf("}");
  if (a < 0 || b < 0) {
    console.error("JSON parsing error: No curly braces found in output:", out);
    return null;
  }
  const jsonStr = out.slice(a, b + 1);
  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    // Attempt parsing with common LLM formatting fixes (trailing commas and literal newlines inside strings)
    try {
      let fixed = jsonStr
        .replace(/,\s*}/g, "}")
        .replace(/,\s*\]/g, "]");
      
      // Escape literal newlines inside double-quoted string values
      fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
      });
      
      return JSON.parse(fixed) as T;
    } catch (parseErr) {
      console.error("JSON parsing error: Failed to parse sliced JSON string. Raw output:", out, "Error:", err, "Resilient try error:", parseErr);
      return null;
    }
  }
}

// ---------- Smart structured understanding of the pasted business text ----------
export type AiAnalysis = {
  company?: string;
  countryCode?: string; // NZ | AU | US | CA | UK | XX
  language?: AppLang;
  positions?: string[];
  orgType?: OrgType;
  intent?: Intent;      // "job" (employment application) or "study" (university/school admissions)
  isRecruitmentAgency?: boolean;
};

export async function aiAnalyze(text: string, tier: AiTier = "free"): Promise<AiAnalysis | null> {
  if (!aiEnabled()) return null;
  const prompt = `${PAPLY_PERSONA}

Right now you are performing the ANALYSIS step: a user pasted RAW text scraped/copied from an organization's web page or a job listing. This could be ANY type of organization — hotel, restaurant, dental clinic, hospital, law firm, NGO, government agency, media company, mining company, recruitment agency, fitness studio, real estate agency, university, farm, construction company, school, IT company, retail store, salon, shipping company, etc. The text may also come from a JOB BOARD page (Seek, Indeed, LinkedIn, TradeMe Jobs, Reed, Glassdoor) — in that case, the organization name typically appears prominently near the job title, not embedded in navigation or platform chrome. The text may contain noisy elements like header/footer menus, cookie banners, booking systems, social media links, copyright notices, and platform/builder templates (e.g., Wix, Shopify, Squarespace, GoDaddy, WordPress). Read it like a careful human and return clean, structured facts.

Return STRICT JSON ONLY, no prose, exactly these keys:
{
  "company": "the clean, human-readable name of the organization/employer/institution. CRITICAL rules:
   - Identify the actual local organization name (e.g. 'The Green View Hotel', 'Smile Dental Care', 'Technical University of Munich').
   - IGNORE website builders, hosting platforms, or web design credits (e.g., NEVER return 'Wix', 'Shopify', 'Squarespace', 'GoDaddy', 'WordPress', 'Theme', or 'Website Design by X').
   - IGNORE generic website navigation labels, headings, accessibility links, and UI elements (e.g., NEVER return 'Skip to Content', 'Skip to Main Content', 'Skip Navigation', 'Home', 'Menu', 'Book Now', 'Contact Us', 'Cart', 'Welcome', 'About Us', 'Opening Hours', 'Follow Us').
   - IGNORE legal entities or cookie notice texts (e.g., drop 'Ltd', 'Pty Ltd', 'Inc', 'Cookie Policy', 'Privacy Policy', 'Terms of Service').
   - NEVER include geographic descriptors or city/country names after the brand (e.g., '© 2026 Capri on Fenton, Rotorua, New Zealand. Privacy Policy' → return ONLY 'Capri on Fenton', not 'Capri On Fenton Rotorua New Zealand Privacy Policy').
   - If a copyright line contains the brand + city + country + legal text, extract ONLY the brand name.
   - Deduplicate repeated logo/header text (e.g. 'Hotel MontrealHotel Montreal' -> 'Hotel Montreal').
   - If unsure, infer the name from copyright lines (e.g., '© 2026 The Green View Hotel') or the domain of emails/links in the text.
   - NEVER return generic email provider names (like 'Gmail', 'Yahoo', 'Hotmail', 'Outlook', 'Proton', 'ProtonMail') or ISP names (like 'Xtra', 'Spark', 'Slingshot', 'Orcon', 'Clear') as the organization name.
   - If the only email is on a generic provider/ISP (e.g. 'zephyrestaurantnz@gmail.com'), do NOT return 'Gmail'. Instead, extract and clean the brand name from the username/prefix part of the email address (e.g., 'zephyrestaurantnz@gmail.com' -> 'Zephyr Restaurant').
   - Do not return generic phrases like 'Restaurant' or 'Clinic' unless it is part of the actual brand name.
   - CRITICAL — a company name is a short PROPER NOUN / BRAND, never a sentence or a benefit/perks bullet point. If the page lists perks like 'Competitive remuneration package', 'A professional, fun and rewarding working environment', 'Continued on the job learning with the X Group' — these are BENEFITS THE EMPLOYER OFFERS, not the employer's name. NEVER return one of these bullet points as the company. The real name is almost always the prominent heading/logo/title near the top of the page (e.g. 'Eichardt's Hotel, Bar and Grille'), not a line from a bulleted list of perks.",
  "countryCode": "ISO 3166-1 alpha-2 code for the destination country: one of NZ, AU, US, CA, UK, DE, ES, FR, IT, NL, PT, IE, AT, CH, GR, SE, DK, NO, BE, FI, CZ, PL — or XX if genuinely unknown. Infer from postal address, phone country/area code, email TLD (.co.nz, .com.au, .co.uk, .ca, .de, .es, .fr, .it, .nl, .pt, .be, .fi, .cz, .pl), and city names.",
  "language": "the language the application email should be written in to best match this organization: one of en, tr, es, fr, de, it, pt",
  "orgType": "what kind of organization this is — one of: hotel, restaurant, cafe, bar, farm, clinic, dental_clinic, hospital, pharmacy, care_home, university, school, childcare_centre, construction, factory, warehouse, logistics, garage, retail, salon, it_company, office, ngo, government, media, professional_services, recruitment_agency, fitness, event_venue, shipping, mining, generic. Use 'recruitment_agency' ONLY when the page is clearly a staffing / recruitment / labour-hire firm listing a vacancy on behalf of a client employer.",
  "intent": "job OR study. Use 'study' ONLY when the page is a university/school ADMISSIONS or program page (degree programs, tuition, enrolment, entry requirements, international students) rather than a careers/jobs page. A university's staff-vacancies page is 'job'.",
  "positions": ["1-3 realistic roles to apply for at THIS organization, in ANY industry — e.g. 'Lawyer' at a law firm, 'Social Worker' at an NGO, 'Financial Analyst' at an advisory firm, 'Project Manager' at a consulting firm, 'Personal Trainer' at a gym, 'Real Estate Agent' at a property company, 'Dentist' or 'Dental Assistant' at a dental clinic, 'Registered Nurse' at a hospital, 'Software Engineer' at a tech company, 'Farm Worker' at an orchard, 'Waiter' at a restaurant, 'Electrician' at a construction firm. Prefer explicitly advertised vacancies; otherwise infer what this organization plausibly hires. If intent is 'study', return the study PROGRAM(S) of interest instead (e.g. 'MSc Computer Science', 'Bachelor of Dentistry')."],
  "isRecruitmentAgency": "true if this appears to be a RECRUITMENT / STAFFING AGENCY (e.g. Hays, Adecco, Robert Half, Randstad, Manpower, Hudson, or a local staffing firm) posting on behalf of a client company — false or omit otherwise. When true, the 'company' field should be the CLIENT employer name if identifiable, not the agency name."
}

Critical rules:
- DEDUPLICATE the brand: if the text shows "Hotel MontrealHotel Montreal" return "Hotel Montreal".
- The NAME can be misleading: a business in New Zealand / Australia / USA / UK / English-Canada is "en" even if its name sounds foreign (e.g. "Hotel Montreal" in Christchurch, New Zealand → countryCode NZ, language en).
- Output NO email addresses and invent NOTHING. Only the six keys above.

Organization text:
"""
${text.slice(0, 6000)}
"""`;

  const parsed = extractJson<AiAnalysis>(await complete(prompt, 500, tier));
  if (!parsed) return null;
  const langs = APP_LANGS.map((l) => l.code) as string[];
  const orgType = typeof parsed.orgType === "string" && (VALID_ORG_TYPES as string[]).includes(parsed.orgType) ? (parsed.orgType as OrgType) : undefined;
  return {
    company: typeof parsed.company === "string" && parsed.company.trim() ? parsed.company.trim().slice(0, 120) : undefined,
    countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) : undefined,
    language: typeof parsed.language === "string" && langs.includes(parsed.language) ? (parsed.language as AppLang) : undefined,
    orgType,
    intent: parsed.intent === "study" ? "study" : parsed.intent === "job" ? "job" : undefined,
    positions: Array.isArray(parsed.positions)
      ? parsed.positions.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 4)
      : undefined,
    isRecruitmentAgency: parsed.isRecruitmentAgency === true ? true : undefined,
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
  orgType?: OrgType;             // detected organization type (clinic, hotel, university, farm…)
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
  const regulated = regulatedRoles(profile.targetRoles);
  const regulatedLine = regulated.length
    ? `\n- NOTE: ${regulated.join(", ")} ${regulated.length > 1 ? "are regulated professions" : "is a regulated profession"} — practicing in ${opts.countryName} typically also requires local professional registration/licensure.`
    : "";

  // Build a deterministic prompt with strict rubric-based scoring so the same inputs always produce the same result.
  const prompt = `${PAPLY_PERSONA}

Right now you are performing the FIT-ASSESSMENT step, acting as the deterministic matching engine. Your output must be EXACTLY
reproducible: given the same inputs, you MUST return the same JSON every time. Do NOT introduce any randomness.

Determine which of the applicant's target roles fit THIS specific business, calculate the fit score using the
STRICT RUBRIC below, and flag any hard eligibility constraint the listing itself states.

APPLICANT
- Target roles (wish list): ${profile.targetRoles.join(", ") || "(none set)"}
- Target countries (where they want to go): ${profile.targetCountries.join(", ") || "(none set — treat any destination as acceptable)"}
- Currently based in: ${profile.currentCountry || "(unspecified)"}
- Languages: ${profile.languages.join(", ") || "(unspecified)"}
- Open to relocating: ${profile.relocation ? "yes" : "no"}
${profile.shortBio ? `- Bio: ${profile.shortBio}\n` : ""}${profile.cvText ? `- CV EXTRACT (use this as the primary evidence for the EXPERIENCE & SKILLS score below):\n"""\n${profile.cvText.slice(0, 2500)}\n"""\n` : ""}- Work eligibility: ${visaLine}${regulatedLine}${documentsSection(profile)}

THE ORGANIZATION
- Name: ${opts.company}
- Country: ${opts.countryName}
- Type: ${opts.orgType || "unknown"} (could be any industry: hospitality, healthcare/dental, engineering, IT, construction, farm/agriculture, education, retail, logistics, office, law firm, NGO, government, media/creative, mining, shipping, fitness, recruitment agency, real estate, aviation, professional services…)
- Roles it appears to offer: ${opts.businessPositions.join(", ") || "(not explicitly stated — infer from the organization type)"}

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

4. LOCATION & LOGISTICS (0-15 points) — use "Currently based in" and "Target countries"
   - 15: Applicant is already in the organization's country, or it is one of their target countries and no barriers exist
   - 10: The organization's country is in the applicant's target countries and they are willing to relocate
   - 7: Country is NOT in their target list but they are open to relocating
   - 5: Relocation possible but uncertain
   - 0: Significant location barriers and applicant is not open to relocating

5. WORK AUTHORIZATION (0-10 points)
   - 10: Applicant already has work authorization for this country
   - 5: Sponsorship needed but listing doesn't explicitly exclude it
   - 0: Listing explicitly requires existing work rights and applicant doesn't have them

fitScore = sum of all 5 components (0-100).

Return STRICT JSON ONLY, exactly these keys:
{
  "applyFor": ["1-2 of the applicant's target roles that truly fit this business; if none fit, the single closest realistic role for this venue"],
  "droppedRoles": ["target roles that do NOT fit this business, e.g. lodging roles at a standalone restaurant"],
  "fitScore": <number: sum from rubric above>,
  "fitSummary": "ONE short sentence in ${langName}, addressed to the applicant, explaining the fit and which role(s) you're applying for and why.",
  "eligibility": {
    "status": "ok | warning | blocked",
    "note": "If the listing explicitly requires something the applicant may not meet (valid work rights / no sponsorship offered / citizens or residents only / specific local license), state it in ${langName} and what it means for them. Otherwise empty string."
  }
}

Rules:
- applyFor must be a subset of realistic roles for this organization. Prefer the applicant's own wording.
- If the organization's country is NOT among the applicant's target countries, mention that briefly in fitSummary (it may still be a fine opportunity — inform, don't block).
- eligibility.note ONLY from explicit text in the page — with ONE exception: if the applicant's matched role is a regulated profession (doctor, dentist, nurse, pharmacist, teacher, electrician, plumber…) and they would be moving countries, you may set status "warning" with a short note that local professional registration/licensure is typically required (name the typical body if you are confident, e.g. AHPRA in Australia, GDC/NMC in the UK, dental/medical council elsewhere). Licensing alone is NEVER "blocked" unless the page explicitly requires current local registration.
- If the applicant needs sponsorship AND the listing says no sponsorship / must already have work rights → status "blocked".
- If it's implied or country-typical but not stated → status "warning" at most. Never invent a constraint from the page.
- CRITICAL: Be deterministic. Same inputs = same output. Do not vary your assessment.`;

  // 600 was too tight: reasoning-model providers (gpt-oss) emit inline chain-of-thought tokens
  // even at "low" effort, which was truncating the JSON mid-object before the closing braces and
  // silently failing extractJson — collapsing every fit assessment to the fitScore:0 fallback.
  const parsed = extractJson<Partial<FitAssessment>>(await complete(prompt, 1100, opts.tier || "free", "low", 0));
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
  const prompt = `${PAPLY_PERSONA}

Right now you are performing the VISA-DOCUMENT-READING step: read a residence/work visa or permit document (OCR/extracted text, possibly messy) and return which countries it authorizes the holder to WORK in.

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
  const prompt = `${PAPLY_PERSONA}

Right now you are writing a SHORT, polite follow-up email for a job application that hasn't received a reply yet.

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
  const prompt = `${PAPLY_PERSONA}

Right now you are writing an ALTERNATIVE SUBJECT LINE. A job applicant is sending an application email to "${company}" for roles: ${positions.join(", ") || "the role(s) this organization offers"}.
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
  const prompt = `${PAPLY_PERSONA}

Right now you are REFINING the BODY of a job-application email. Apply this change: ${REFINE_INSTRUCTION[opts.action]}

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
  applyForRoles?: string[],
  context?: { orgType?: OrgType; intent?: Intent }
): Promise<string | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";
  const rolesForThisJob = (applyForRoles && applyForRoles.length ? applyForRoles : analysis.positions).filter(Boolean);
  const orgType = context?.orgType || analysis.orgType || "generic";
  const intent = context?.intent || analysis.intent || "job";
  const formal = isFormalOrg(orgType);
  const rolesLine = rolesForThisJob.join(", ") || "the most suitable role for this organization";

  const currentCountryLine = profile.currentCountry
    ? `- Currently based in: ${profile.currentCountry}`
    : "";

  // ===== STUDY MODE: motivation/statement letter for admissions =====
  if (intent === "study") {
    const prompt = `${PAPLY_PERSONA}

Right now you are writing a MOTIVATION LETTER for a university/school admissions application. Write a formal, compelling motivation letter body for ${profile.fullName || "the applicant"}, an international applicant to "${analysis.company}" in ${analysis.country.name}, program(s): ${rolesLine}.

APPLICANT INFO:
- Name: ${profile.fullName || "the applicant"}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
${currentCountryLine ? currentCountryLine + "\n" : ""}${profile.shortBio ? `- Background: ${profile.shortBio}\n` : ""}${profile.cvText ? `- CV EXTRACT:\n"""\n${profile.cvText.slice(0, 2000)}\n"""\n` : ""}${documentsSection(profile)}
RAW TEXT FROM THE INSTITUTION'S PAGE (extract curriculum focus, values, research strengths, intake info):
"""
${text.slice(0, 4000)}
"""

Write fully in ${langName} at native speaker quality. Return STRICT JSON only: {"body": "..."}.

Rules:
- Formal greeting ("Dear Admissions Committee," or localized formal equivalent). Never casual.
- Structure: (1) motivation for THIS program at THIS institution with one concrete detail from the page; (2) academic/professional background that prepares them, only real facts from the profile/CV; (3) goals — what they intend to do with the qualification; (4) closing — documents available, look forward to the application process. NO signature/sign-off/name at the end.
- Concise, grounded, zero clichés ("since childhood I have dreamed…" is banned). Invent NO grades, test scores, or qualifications.`;
    const parsedStudy = extractJson<{ body?: string }>(await complete(prompt, 1000, tier));
    return parsedStudy?.body || null;
  }

  // ===== JOB MODE =====
  const greetingRule = formal
    ? `A FORMAL professional greeting ("Dear Hiring Team," or the formal local equivalent — e.g. "Sehr geehrte Damen und Herren," in German). This is a ${orgType.replace(/_/g, " ")} — do NOT use casual greetings like "Kia Ora" or "Hola".`
    : `A warm local greeting based on the target country/cues (e.g., "Kia Ora," for NZ/AU, "Hola," for Spain/Spanish countries, "Bonjour," for France, "Hallo," for Germany, "Ciao," for Italy, "Olá," for Portugal/Brazil, or "Dear Hiring Team,"/localized equivalent for others).`;

  const prompt = `${PAPLY_PERSONA}

Right now you are writing a COVER LETTER for a job application, for ANY industry — hospitality, healthcare/dental, engineering, IT, construction, farm/seasonal work, education, retail, logistics, office. Write a formal, outstanding Cover Letter body for ${profile.fullName || "the applicant"} applying to "${analysis.company}" (a ${orgType.replace(/_/g, " ")}) in ${analysis.country.name} for the roles: ${rolesLine}.

APPLICANT INFO:
- Name: ${profile.fullName || "the applicant"}
- Target Roles: ${rolesLine}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
${currentCountryLine ? currentCountryLine + "\n" : ""}- Relocation: ${profile.relocation ? "Yes" : "No"}
${profile.shortBio ? `- Bio / Professional Background: ${profile.shortBio}\n` : ""}${profile.cvText ? `- CV EXTRACT (use real experience from here):\n"""\n${profile.cvText.slice(0, 2000)}\n"""\n` : ""}${documentsSection(profile)}- Work eligibility: ${profile.needsVisaSponsorship ? "Requires visa sponsorship" : "Work authorized"}

THE ORGANIZATION:
- Name: ${analysis.company}
- Type: ${orgType.replace(/_/g, " ")}
- Location: ${analysis.country.name}

RAW TEXT FROM JOB LISTING / WEBSITE (Study this to extract the organization's culture, specialties, projects, patient/customer focus, or brand identity):
"""
${text.slice(0, 4000)}
"""

Write the cover letter fully in ${langName} at native speaker quality.
Return STRICT JSON only: {"body": "..."}.

Rules for the cover letter:
- TARGET LENGTH: ~280-350 words — a cover letter is a fuller, more developed document than the shorter email body; give it real depth and substance, not a condensed summary. This is not a hard cap — prioritize genuine substance, but never pad with filler or repetition just to reach it.
- Write the full text of the cover letter body, starting with a greeting.
- Do NOT include applicant details, date, or company address at the top. Those are added automatically.
- Structure it professionally, with each section more developed than in a short email:
  1. Greeting: ${greetingRule}
  2. Introduction (2-3 sentences): State interest in the role at the specific organization, demonstrating genuine enthusiasm. Reference 1-2 specific details of their work (specialty, projects, location, team culture, etc.).
  3. Experience/Why Me (2 full paragraphs): Map the applicant's background, bio, and languages to this organization's specific needs — use the vocabulary of THIS field (patient care for clinics, site safety for construction, harvest reliability for farms, stack and shipped work for IT, service quality for hospitality). Give 2-3 distinct, concrete examples of relevant experience or skills, not just one. ${profile.currentCountry ? `Mention that they are currently based in ${profile.currentCountry} and ready to step into this role.` : ""}
  4. Conclusion (2-3 sentences): Reiterate interest, state that the resume/CV is enclosed, and express interest in discussing further. DO NOT include a signature, sign-off, or your name at the end.
- Grounded and highly customized — depth comes from specificity, not from adjectives. Avoid clichés and generic flattery.
- Present language skills clearly (e.g., Native, B2, A2) without exaggeration.
- Invent no fake details, licenses, or qualifications.`;

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
  reasoningEffort: "low" | "high" = "low",
  context?: { orgType?: OrgType; intent?: Intent }
): Promise<DraftOption[] | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";
  const rolesForThisJob = (applyForRoles && applyForRoles.length ? applyForRoles : analysis.positions).filter(Boolean);
  const orgType = context?.orgType || analysis.orgType || "generic";
  const intent = context?.intent || analysis.intent || "job";
  const formal = isFormalOrg(orgType);

  const currentCountryLine = profile.currentCountry
    ? `- Currently based in: ${profile.currentCountry}`
    : "";

  let thinkingInstruction = "";
  if (reasoningEffort === "high") {
    thinkingInstruction = "\n\nDEEP REASONING MODE: Please analyze the page thoroughly. Think deeply about the organization's culture, requirements, and how the applicant's profile maps to it. Craft drafts that show a profound understanding of the organization and look extremely tailored, mature, and professional.";
  }

  // ===== STUDY MODE: university/school admissions inquiry, not a job application =====
  if (intent === "study") {
    const programsLine = rolesForThisJob.join(", ") || "(infer the most relevant program(s) from the page and the applicant's background)";
    const studyVisa = profile.needsVisaSponsorship || !authorization?.authorized
      ? `As an international applicant, they will need ${analysis.country.visa}; mention awareness of this process briefly and confidently — never apologetically.`
      : `They already hold authorization to be in ${analysis.country.name}; no visa discussion needed.`;
    const studyPrompt = `${PAPLY_PERSONA}

Right now you are writing an ADMISSIONS INQUIRY (not a job application). Write THREE distinct admission/enrolment inquiry emails for ${profile.fullName || "the applicant"}, an international applicant writing to a university/school's admissions office.

1. "Balanced & Personal": Warm-professional. Genuine motivation for THIS institution and program, academic/professional background mapped to entry requirements.
2. "Short & Direct": Compact and precise — states the program of interest, key qualifications, and the specific questions. Perfect for a busy admissions officer.
3. "Skills & Bio Focused": Leads with the applicant's academic/professional background and language abilities, then connects them to the program.

=== APPLICANT PROFILE ===
- Full Name: ${profile.fullName || "(not specified)"}
- Program(s) of interest: ${programsLine}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
${currentCountryLine ? currentCountryLine + "\n" : ""}${profile.shortBio ? `- Background: ${profile.shortBio}\n` : ""}${profile.cvText ? `- CV EXTRACT:\n"""\n${profile.cvText.slice(0, 2000)}\n"""\n` : ""}${documentsSection(profile)}- ${studyVisa}

=== THE INSTITUTION ===
- Name: ${analysis.company}
- Country: ${analysis.country.name}

=== RAW PAGE TEXT (admissions/program page) ===
"""
${text.slice(0, 4000)}
"""
${thinkingInstruction}

=== EMAIL STRUCTURE GUIDE ===
1. OPENING: Formal greeting ("Dear Admissions Team" / "Dear ${analysis.company} Admissions Office" — never casual). Express clear interest in the specific program, referencing ONE concrete detail from the page (curriculum focus, research strength, intake dates…).
2. BACKGROUND (2-3 sentences): The applicant's academic/professional background and why it prepares them for this program. Only facts from the profile/CV.
3. PRACTICAL (1-2 sentences): Languages; current location${profile.currentCountry ? ` (currently based in ${profile.currentCountry})` : ""}; brief, confident mention of the student-visa step if relevant.
4. ASK (1-2 sentences): Politely ask about the application process, entry requirements for international students, or the next intake — pick what the page does NOT already answer.
5. CLOSING: Mention that their CV/transcripts are available (CV is attached). NO sign-off, name, or signature block — it is appended automatically.

=== OUTPUT FORMAT ===
Write fully IN ${langName} (subject AND body), native-speaker quality.
Return STRICT JSON only:
{
  "drafts": [
    { "style": "Balanced & Personal", "subject": "...", "body": "..." },
    { "style": "Short & Direct", "subject": "...", "body": "..." },
    { "style": "Skills & Bio Focused", "subject": "...", "body": "..." }
  ]
}

=== HARD RULES ===
- Subject: plain text, NO "SUBJECT:" prefix — specific, e.g. "International Admission Inquiry — MSc Computer Science".
- Formal register throughout. No bullet points. No clichés, no invented qualifications, grades, or test scores.
- NO closing salutation/name/signature block at the end.`;

    const parsedStudy = extractJson<{ drafts?: DraftOption[] }>(await complete(studyPrompt, 1800, tier, reasoningEffort));
    if (parsedStudy?.drafts && Array.isArray(parsedStudy.drafts) && parsedStudy.drafts.length === 3) {
      return parsedStudy.drafts;
    }
    return null;
  }

  // ===== JOB MODE =====
  const rolesLine = rolesForThisJob.join(", ") || "(infer 1-2 suitable roles for this organization from the page)";

  const sponsorship = authorization?.authorized
    ? `IMPORTANT — the applicant ALREADY HOLDS a valid ${authorization.visaLabel || "work authorization"} that permits them to work in ${analysis.country.name}. They do NOT need any sponsorship. State this clearly and positively as a major advantage: they are legally able to start without the employer arranging or paying for a visa, and they are immediately available. Do NOT ask for sponsorship.`
    : profile.needsVisaSponsorship
    ? `The applicant REQUIRES visa sponsorship to work in ${analysis.country.name} (${analysis.country.visa}). State this transparently and confidently — never apologetically.`
    : `The applicant does not need visa sponsorship; do not mention visas.`;

  // Casual local greetings suit a cafe or beach hotel; a dental clinic, hospital, engineering
  // firm, or office expects formal address. The org type decides.
  const greetingRule = formal
    ? `   - GREETING RULE: This is a ${orgType.replace(/_/g, " ")} — use a FORMAL professional greeting in ${langName} ("Dear Hiring Team", "Dear ${analysis.company} Team", or the formal local equivalent, e.g. "Sehr geehrte Damen und Herren" in German). Do NOT use casual greetings like "Kia Ora", "Hola", "Ciao", or "Hey".`
    : `   - GREETING RULE: Customize the greeting based on the target country and local cues:
     * New Zealand (NZ) (or Australia if there are local/Māori cues in the page text): Start with a warm "Kia Ora" (e.g. "Kia Ora [Company] Team", "Kia Ora [Company] Whānau", or just "Kia Ora").
     * Spain (ES) (or Spanish-speaking countries): Start with a warm "Hola".
     * France (FR): "Bonjour". Germany (DE): "Hallo". Italy (IT): "Ciao"/"Buongiorno". Portugal (PT): "Olá".
     * Otherwise: "Dear Hiring Team" or "Dear [Company] Team".`;

  // Industry-adaptive evidence guidance so a dentist's email doesn't talk about "floor service".
  const industryHints: Partial<Record<OrgType, string>> = {
    clinic: "patient care quality, clinical reliability, hygiene/sterilization standards, calm communication with patients",
    dental_clinic: "patient care quality, chairside manner, clinical precision, hygiene/sterilization standards",
    hospital: "patient safety, clinical protocols, shift reliability, teamwork across departments",
    pharmacy: "dispensing accuracy, patient counselling, regulatory compliance",
    care_home: "compassionate resident care, patience, reliability across shifts",
    farm: "physical stamina, reliability through the season, machinery/equipment experience, early starts, teamwork in all weather",
    construction: "site safety awareness, reliability, reading plans, quality workmanship under deadlines",
    factory: "process discipline, safety compliance, consistency on repetitive tasks, machine operation",
    warehouse: "pick accuracy, pace, safety compliance, inventory discipline",
    logistics: "punctuality, route/schedule discipline, clean driving/safety record where relevant",
    it_company: "concrete technical skills and stack, shipped work, collaboration and code quality",
    office: "organization, accuracy, professional communication, software proficiency",
    retail: "customer service, sales awareness, stock management, till reliability",
    salon: "client experience, technical skill, hygiene standards, retail upselling",
    school: "classroom presence, planning, safeguarding awareness, parent communication",
    university: "subject expertise, research/teaching record, collaboration",
  };
  const evidenceHint = industryHints[orgType] || "operational readiness, consistency under pressure, and specific task experience relevant to this organization's field";

  const prompt = `${PAPLY_PERSONA}

Right now you are writing a JOB APPLICATION EMAIL. Your emails feel genuinely human, mature, and professional — highly grounded and realistic. Applications may target ANY industry — hospitality, healthcare/dental, engineering, IT, construction, farm/seasonal work, education, retail, logistics, office roles. Adapt vocabulary and register to THIS organization's field. Write THREE distinct application emails for ${profile.fullName || "the applicant"}.

Each draft must have a genuinely different LENGTH and angle, but ALL must avoid clichés and generic flattery. Focus on concrete evidence: ${evidenceHint}. Present language skills clearly (e.g., Native, B2, A2) without exaggeration.
1. "Balanced & Personal" (TARGET ~180-220 WORDS, the fullest draft): Warm-professional tone. Opens with genuine interest in the specific organization, connects the applicant's background to it with 2-3 concrete, specific examples (not just one), states language proficiency levels clearly, and addresses visa status confidently. Give real texture — this is the applicant's best, most complete pitch, not a summary.
2. "Short & Direct" (TARGET ~80-110 WORDS, deliberately the shortest): Compact, high-impact. Every sentence earns its place. Perfect for busy hiring managers. Focuses purely on concrete value and readiness to start.
3. "Skills & Bio Focused" (TARGET ~150-190 WORDS): Leads with the applicant's relevant skills and professional background in real depth — specific responsibilities, tools, or achievements from their bio/CV, not just a label — then connects them to this role. Highlights multilingual ability and adaptability.

=== APPLICANT PROFILE ===
- Full Name: ${profile.fullName || "(not specified)"}
- Applying specifically for: ${rolesLine}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
${currentCountryLine ? currentCountryLine + "\n" : ""}- Open to relocating: ${profile.relocation ? "yes" : "no"}
${profile.shortBio ? `- Professional Background: ${profile.shortBio}\n` : ""}${profile.cvText ? `- CV EXTRACT (use real experience from here):\n"""\n${profile.cvText.slice(0, 2000)}\n"""\n` : ""}${documentsSection(profile)}- ${sponsorship}

=== THE ORGANIZATION ===
- Name: ${analysis.company}
- Country: ${analysis.country.name}
- Type: ${orgType.replace(/_/g, " ")}

=== RAW PAGE / JOB LISTING TEXT ===
Study this carefully. Extract concrete, real details — the organization's philosophy, specialties, service standards, projects, patient/customer focus, brand personality, etc. Use these in the emails.
"""
${text.slice(0, 4000)}
"""
${thinkingInstruction}

=== EMAIL STRUCTURE GUIDE ===
Each email body must flow through these sections naturally (do NOT use bullet points or numbered lists — write in flowing paragraphs). The sentence counts below are for the "Short & Direct" draft only — for "Balanced & Personal" and "Skills & Bio Focused", EXPAND each section with more concrete detail to reach their target word count (use 2-3x the sentence count per section, add specific examples from the bio/CV, elaborate on how the applicant's background maps to the organization's actual needs):
1. OPENING (1-2 sentences, more for longer drafts): Express genuine interest in the role at the specific organization. Reference ONE real, specific detail about it from the page (their philosophy, a specialty, their team culture, an award, a project, etc.).
${greetingRule}
2. EXPERIENCE & FIT (2-3 sentences, more for longer drafts): Map the applicant's professional background and bio to the specific needs of this organization. Be concrete about what they bring — ${evidenceHint}. For the longer drafts, give 2-3 distinct, specific examples instead of one.
3. LANGUAGES & LOCATION (1-2 sentences): Mention the applicant's languages as a practical asset.${profile.currentCountry ? ` Mention that they are currently based in ${profile.currentCountry}.` : ""}
4. VISA & AVAILABILITY (1 sentence): Address work authorization status directly and confidently — never apologetically. ${authorization?.authorized ? "Emphasize that they already hold valid work authorization as a major advantage." : profile.needsVisaSponsorship ? "State the need for sponsorship transparently." : "Do not mention visas."}
5. CLOSING (1-2 sentences): Note that the CV/resume is attached. Express genuine interest in contributing to the team. Do NOT include any sign-off, salutation, name, or signature block.

Word counts above are targets, not hard caps — always prioritize quality and genuine substance over hitting an exact number. Never pad with filler or repetition just to reach a target length.

=== OUTPUT FORMAT ===
Write the emails fully IN ${langName} (subject AND body), at native-speaker quality.
Return STRICT JSON only:
{
  "drafts": [
    { "style": "Balanced & Personal", "subject": "...", "body": "..." },
    { "style": "Short & Direct", "subject": "...", "body": "..." },
    { "style": "Skills & Bio Focused", "subject": "...", "body": "..." }
  ]
}

=== HARD RULES ===
- Apply ONLY for the role(s) listed under "Applying specifically for" — do NOT mention or apply for any other role. The subject line names only these role(s).
- Subject: plain text, NO "SUBJECT:" prefix. Make it specific to the organization and role — never generic like "Job Application".
- Write in professional, natural paragraphs — no bullet points, no numbered lists.
- Reference the organization by its correct name and at least one concrete, true detail from the page text. Show you actually know what it does.
- NO "Sincerely"/"Kind regards"/any closing salutation, NO applicant name, email, phone, or signature block at the end — a Gmail signature is appended automatically.
- Invent NOTHING — no email addresses, no qualifications, licenses, or facts not supported by the page or applicant profile. No clichés ("I am a passionate individual"), no fake urgency, no filler phrases.
- Keep the tone mature, confident, and human. These emails should read like a real professional wrote them, not like a template or a chatbot.`;

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
  applicantCurrentCountry?: string;
  needsVisaSponsorship?: boolean;
  openToRelocation?: boolean;
  cvText?: string | null;
  documentsText?: string | null;
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
    opts.applicantCurrentCountry ? `- Currently Based In: ${opts.applicantCurrentCountry}` : null,
    opts.needsVisaSponsorship ? `- Work Authorization: Requires visa sponsorship` : `- Work Authorization: Authorized to work, no sponsorship needed`,
    opts.openToRelocation ? `- Relocation: Open to relocation` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `${PAPLY_PERSONA}

Right now you are DEEPLY REWRITING a cover letter. Your task is to dramatically IMPROVE the cover letter below.

APPLICANT PROFILE:
${applicantLines || "(profile not available)"}
${opts.cvText ? `\nAPPLICANT RESUME / CV TEXT:\n"""\n${opts.cvText.slice(0, 3000)}\n"""\n` : ""}${documentsSection({ documentsText: opts.documentsText })}

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
- Structure it professionally:
  1. Greeting: A warm local greeting based on the target country/cues (e.g., "Kia Ora," for NZ/AU, "Hola," for Spain/Spanish countries, "Bonjour," for France, "Hallo," for Germany, "Ciao," for Italy, "Olá," for Portugal/Brazil, or "Dear Hiring Team,"/localized equivalent for others).
  2. Opening: Genuine enthusiasm with a specific reason for THIS company/role, not generic flattery.
  3. Body: Powerfully connect applicant's skills/experience to the job's specific requirements and culture. ${opts.applicantCurrentCountry ? `Mention that they are currently based in ${opts.applicantCurrentCountry} and ready to start/relocate.` : ""}
  4. Closing: Express availability, mention CV/resume is attached, invite next steps. DO NOT include a signature, sign-off, or your name at the end.
- Do NOT include applicant details, date, or company address at the top. Those are added automatically.
- Write fully in ${langName} at native speaker quality.
- Be specific, compelling, and avoid generic phrases like "I am a motivated individual".
- Return STRICT JSON only: {"body": "..."}`;

  const parsed = extractJson<{ body?: string }>(await complete(prompt, 1200, opts.tier || "free"));
  if (parsed?.body && typeof parsed.body === "string" && parsed.body.trim()) {
    return parsed.body.trim();
  }
  return null;
}

// ---------- Chat Assistant / Q&A Refinement ----------
// This is the "AI chat" the user talks to on the results page — it must feel like ONE coach who
// already knows them, not a generic assistant that forgot who they are between messages. Every
// call gets the applicant's full profile (target roles, target countries, current country, visa
// situation, languages, bio) plus the organization context (name, type, country, which role(s)
// this specific application targets) so it NEVER drifts from context, and it can both answer a
// question AND make a real edit (body/subject/cover letter) in the same turn when asked to.
export async function aiAsk(opts: {
  body: string;
  subject?: string;
  coverLetter?: string;
  jobText: string;
  question: string;
  company?: string;
  orgType?: OrgType;
  countryName?: string;
  applyFor?: string[];
  profile?: EngineProfile;
  lang: AppLang;
  tier?: AiTier;
  // Set when the caller (e.g. a role toggle chip) already knows this MUST rewrite the draft —
  // not a chat question that might just get answered in prose. Some free-tier models will
  // happily answer without touching revisedBody unless explicitly forced, so this both hardens
  // the prompt wording and makes the fallback chain reject (and retry the next provider on) any
  // response that skips the edit instead of silently accepting a no-op as success.
  forceRevision?: boolean;
}): Promise<{ answer: string; revisedBody?: string | null; revisedSubject?: string | null; revisedCoverLetter?: string | null } | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === opts.lang)?.label || "English";
  const subjectSection = opts.subject ? `\nCURRENT SUBJECT: "${opts.subject}"` : "";
  const coverLetterSection = opts.coverLetter ? `\nCURRENT COVER LETTER:\n"""\n${opts.coverLetter.slice(0, 2000)}\n"""` : "";

  const p = opts.profile;
  const visaLine = p
    ? p.hasVisa
      ? `Already holds work authorization for: ${(p.visaCountries || []).join(", ") || "(unspecified)"}${p.visaLabel ? ` (${p.visaLabel})` : ""}.`
      : p.needsVisaSponsorship
      ? `Needs visa sponsorship${opts.countryName ? ` to work in ${opts.countryName}` : ""}.`
      : "Does not need visa sponsorship."
    : "(profile not available)";
  const profileSection = p
    ? `
APPLICANT PROFILE (their real, saved profile — ground everything in this, never contradict it):
- Name: ${p.fullName || "(not specified)"}
- Target roles (their wish list across all applications): ${p.targetRoles?.join(", ") || "(none set)"}
- Target countries: ${p.targetCountries?.join(", ") || "(none set)"}
- Currently based in: ${p.currentCountry || "(unspecified)"}
- Languages: ${p.languages?.join(", ") || "(unspecified)"}
- Open to relocating: ${p.relocation ? "yes" : "no"}
${p.shortBio ? `- Bio: ${p.shortBio}\n` : ""}- Work eligibility: ${visaLine}${p.cvText ? `\n- CV EXTRACT:\n"""\n${p.cvText.slice(0, 1500)}\n"""` : ""}${documentsSection(p)}`
    : "";
  const orgSection = opts.orgType || opts.countryName || opts.applyFor?.length
    ? `
THIS APPLICATION:
${opts.orgType ? `- Organization type: ${opts.orgType.replace(/_/g, " ")}\n` : ""}${opts.countryName ? `- Country: ${opts.countryName}\n` : ""}${opts.applyFor?.length ? `- Role(s) this application currently targets: ${opts.applyFor.join(", ")}\n` : ""}`
    : "";

  const prompt = `${PAPLY_PERSONA}

Right now you are chatting live with the applicant about ONE specific application they're about to send. You have their real profile, the organization context, the current draft, and their question or edit instruction.
${profileSection}${orgSection}
APPLICANT'S CURRENT DRAFT:
"""
${opts.body}
"""
${subjectSection}${coverLetterSection}
ORGANIZATION: ${opts.company || "the organization"}
RAW PAGE / LISTING TEXT:
"""
${opts.jobText.slice(0, 4000)}
"""

USER'S QUESTION / INSTRUCTION:
"${opts.question}"
${opts.forceRevision ? `\nTHIS IS A REQUIRED EDIT, NOT A QUESTION. The instruction above is a direct command to change which role(s) this application targets. You MUST NOT leave "revisedBody" null and you MUST NOT merely answer in prose — you are REQUIRED to return the fully rewritten email body (and subject, and cover letter if one was provided) reflecting the new role(s). Skipping revisedBody is treated as a failed response.\n` : ""}
INSTRUCTIONS:
1. Answer the user's question directly, honestly, and helpfully — as their coach who already knows their profile above, not a stranger. Keep the answer concise (2-4 sentences max), encouraging, and highly professional. Never contradict facts in their profile or invent new ones.
2. If the user's prompt is an instruction to modify, improve, shorten, or rewrite the email draft (e.g. "make it more energetic", "mention my barista experience", "make it shorter", "also apply for X role"), you MUST also provide the fully rewritten/revised email body in the "revisedBody" field. If the user's prompt is a general question (e.g. "Is this tone appropriate?", "Is the length good?"), leave all revised fields null.
3. If the instruction changes which roles/positions are targeted (e.g. "also apply for waiter", "add kitchen hand", "only apply for front desk"), you MUST also update:
   - "revisedSubject": rewrite the email subject to reflect the new set of roles (format: "Role1 / Role2 Application — Company Name")
   - "revisedCoverLetter": rewrite the cover letter body to mention the updated roles (keep same structure/length, just update role references). If no cover letter was provided, leave null.
4. If providing a revised body:
   - Do NOT include closing salutations (like "Sincerely"), signatures, or applicant name/details at the bottom.
   - Address the email to a greeting appropriate for the organization type and country (formal for clinics/hospitals/offices/universities; a warm local greeting like "Kia Ora" for NZ only for casual hospitality venues).
   - Write fully in ${langName}.
5. Stay strictly on task: you are paply's application coach for THIS application. If the question is unrelated to this application or profile, gently redirect to how you can help with the application instead of answering off-topic requests.

Return STRICT JSON only:
{
  "answer": "...",
  "revisedBody": "..." or null,
  "revisedSubject": "..." or null,
  "revisedCoverLetter": "..." or null
}`;

  type AskResult = { answer?: string; revisedBody?: string | null; revisedSubject?: string | null; revisedCoverLetter?: string | null };
  const parsed = await completeJsonWithFallback<AskResult>(
    prompt,
    3000,
    opts.tier || "free",
    (p) => Boolean(p?.answer) && (!opts.forceRevision || Boolean(p?.revisedBody))
  );
  if (parsed?.answer) {
    return {
      answer: parsed.answer.trim(),
      revisedBody: parsed.revisedBody?.trim() || null,
      revisedSubject: parsed.revisedSubject?.trim() || null,
      revisedCoverLetter: parsed.revisedCoverLetter?.trim() || null,
    };
  }
  return null;
}

