// Opsiyonel: ANTHROPIC_API_KEY tanımlıysa Claude ile işletmeye özgün taslak üretir.
// Anahtar yoksa null döner; server bu durumda akıllı şablona düşer.

const { APPLICANT } = require("./template");

async function aiDraft({ text, analysis }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const prompt = `You are helping ${APPLICANT.name} apply for a hospitality job (target departments: Front Desk and Kitchen Serving). The applicant REQUIRES visa sponsorship to work in ${analysis.country.name} (${analysis.country.visa}) and must state this clearly and professionally.

Applicant languages: ${APPLICANT.languages}.
Detected company: ${analysis.company}
Detected positions: ${analysis.positions.join(", ")}
Detected country: ${analysis.country.name}

Business content the applicant pasted:
"""
${text.slice(0, 4000)}
"""

Write a concise, warm, professional job application email. Return STRICT JSON only: {"subject": "...", "body": "..."}.
Rules:
- The subject must be plain text with NO "SUBJECT:" prefix.
- The body must transparently state the work visa sponsorship requirement, reference the company/role, state the languages, and mention the CV is attached.
- Do NOT include "Sincerely", "Kind regards", any closing salutation, name, email, or signature block (a Gmail signature is added automatically).
- Do NOT invent or guess any email addresses anywhere.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = (data.content && data.content[0] && data.content[0].text) || "";
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    if (parsed.subject && parsed.body) return parsed;
    return null;
  } catch {
    return null;
  }
}

module.exports = { aiDraft };
