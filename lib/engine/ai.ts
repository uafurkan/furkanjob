// AI layer — provider-agnostic. Uses native Anthropic, OR any OpenAI-compatible endpoint
// (OpenRouter, Groq, DeepSeek, Together, local Ollama…) selected via env. No key set → returns
// null and the caller falls back to the smart template. Email addresses are NEVER produced here:
// extraction stays deterministic (lib/engine/detect + websearch) so the "never guess emails" rule holds.
import Anthropic from "@anthropic-ai/sdk";
import type { Draft, GenerateInput } from "./types";
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
async function complete(prompt: string, maxTokens: number, tier: AiTier): Promise<string | null> {
  const r = resolveProvider(tier);
  if (!r) return null;
  try {
    if (r.kind === "anthropic") {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const msg = await client.messages.create({
        model: r.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    }
    const res = await fetch(`${r.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${r.apiKey}` },
      body: JSON.stringify({ model: r.model, max_tokens: maxTokens, temperature: 0.4, messages: [{ role: "user", content: prompt }] }),
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
  const parsed = extractJson<{ subject?: string }>(await complete(prompt, 80, tier));
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

// ---------- Draft generation ----------
export async function aiDraft(
  { text, analysis, profile }: GenerateInput,
  lang: AppLang = "en",
  tier: AiTier = "free",
  authorization?: { authorized: boolean; visaLabel?: string | null }
): Promise<Draft | null> {
  if (!aiEnabled()) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";

  const sponsorship = authorization?.authorized
    ? `IMPORTANT — the applicant ALREADY HOLDS a valid ${authorization.visaLabel || "work authorization"} that permits them to work in ${analysis.country.name}. They do NOT need any sponsorship. State this clearly and positively as a major advantage: they are legally able to start without the employer arranging or paying for a visa, and they are immediately available. Do NOT ask for sponsorship.`
    : profile.needsVisaSponsorship
    ? `The applicant REQUIRES visa sponsorship to work in ${analysis.country.name} (${analysis.country.visa}). State this transparently and confidently — never apologetically.`
    : `The applicant does not need visa sponsorship; do not mention visas.`;

  const prompt = `You write outstanding, human job-application emails — the kind a hiring manager actually replies to. Write ONE application email for ${profile.fullName || "the applicant"}.

APPLICANT
- Roles of interest: ${profile.targetRoles.join(", ") || "Hospitality (infer suitable roles)"}
- Languages: ${profile.languages.join(", ") || "(not specified)"}
- Open to relocating: ${profile.relocation ? "yes" : "no"}
${profile.shortBio ? `- Bio: ${profile.shortBio}\n` : ""}- ${sponsorship}

THE BUSINESS (already analyzed)
- Company: ${analysis.company}
- Country: ${analysis.country.name}
- Relevant positions: ${analysis.positions.join(", ") || "(infer from the page)"}

RAW PAGE TEXT (for concrete, specific detail — reference something real about this venue, not generic flattery):
"""
${text.slice(0, 4000)}
"""

Write the email fully IN ${langName} (subject AND body), at native-speaker quality. Return STRICT JSON only: {"subject": "...", "body": "..."}.

Hard rules (follow exactly):
- Subject: plain text, NO "SUBJECT:" prefix; specific, not generic.
- Body: warm, confident, concise (roughly 110-170 words). Reference the company by name and one concrete, true detail from the page. State the visa sponsorship need transparently if required. Mention the languages naturally. Note that the CV is attached.
- NO "Sincerely"/"Kind regards"/any closing salutation, NO applicant name, email, phone, or signature block — a Gmail signature is appended automatically.
- Invent NOTHING — no email addresses, no facts not supported by the page or applicant profile. No clichés, no fake urgency.`;

  const parsed = extractJson<Partial<Draft>>(await complete(prompt, 900, tier));
  if (parsed?.subject && parsed?.body) return { subject: parsed.subject, body: parsed.body };
  return null;
}
