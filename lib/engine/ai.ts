// Optional Claude generation (Pro). Returns null when no key → caller falls back to the template.
import Anthropic from "@anthropic-ai/sdk";
import type { Draft, GenerateInput } from "./types";
import { APP_LANGS, type AppLang } from "./template";

export async function aiDraft({ text, analysis, profile }: GenerateInput, lang: AppLang = "en"): Promise<Draft | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const langName = APP_LANGS.find((l) => l.code === lang)?.label || "English";

  const sponsorship = profile.needsVisaSponsorship
    ? `The applicant REQUIRES visa sponsorship to work in ${analysis.country.name} (${analysis.country.visa}) and this must be stated clearly and professionally.`
    : `The applicant does not need visa sponsorship.`;

  const prompt = `You are writing a job application email for ${profile.fullName}.
Target departments of interest: ${profile.targetRoles.join(", ") || "Hospitality"}.
Applicant languages: ${profile.languages.join(", ")}.
${profile.shortBio ? `Applicant bio: ${profile.shortBio}\n` : ""}${sponsorship}

Detected from the business page:
- Company: ${analysis.company}
- Country: ${analysis.country.name}
- Open/relevant positions: ${analysis.positions.join(", ") || "(infer suitable hospitality roles)"}

Business content the applicant pasted:
"""
${text.slice(0, 4000)}
"""

Write a concise, warm, professional application email IN ${langName} (both subject and body fully in ${langName}). Return STRICT JSON only: {"subject": "...", "body": "..."}.
Rules (must follow exactly):
- Subject: plain text, NO "SUBJECT:" prefix.
- Body: transparently state the visa sponsorship requirement (if needed), reference the company and role(s), state the languages, and mention the CV is attached.
- Do NOT include "Sincerely", "Kind regards", any closing salutation, the applicant's name, email, phone, or any signature block — a Gmail signature is added automatically.
- Do NOT invent or guess any email addresses anywhere in the output.`;

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    });
    const out = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Partial<Draft>;
    if (parsed.subject && parsed.body) return { subject: parsed.subject, body: parsed.body };
    return null;
  } catch {
    return null;
  }
}
