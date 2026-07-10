import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { aiEnabled, complete, extractJson } from "@/lib/engine/ai";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text: string = (body?.text || "").toString().slice(0, 8000);
  if (text.trim().length < 50) {
    return NextResponse.json({ error: "Paste more LinkedIn profile text." }, { status: 400 });
  }

  // Try AI parsing first (better structured extraction)
  if (aiEnabled()) {
    try {
      const prompt = `Extract structured profile information from this LinkedIn profile text.
Return ONLY valid JSON with these fields (use null for anything not found):
{
  "fullName": "...",
  "currentTitle": "...",
  "currentCompany": "...",
  "location": "...",
  "languages": ["..."],
  "skills": ["..."],
  "targetRoles": ["..."],
  "shortBio": "...",
  "experienceYears": 0,
  "education": "..."
}

Rules:
- "targetRoles": list the person's job titles/roles (current + recent past, max 5)
- "skills": key technical/professional skills only, max 10
- "languages": spoken languages only (not programming languages), max 5
- "shortBio": 1-2 sentence professional summary (from their About section or infer from experience)
- "experienceYears": total years of work experience (integer, 0 if unknown)

LinkedIn text:
${text}`;

      const raw = await complete(prompt, 600, "free");
      if (raw) {
        const parsed = extractJson<Record<string, unknown>>(raw);
        if (parsed && parsed.fullName) {
          return NextResponse.json({ ok: true, parsed, source: "ai" });
        }
      }
    } catch {}
  }

  // Deterministic fallback: regex-based extraction
  const parsed = parseLinkedInText(text);
  return NextResponse.json({ ok: true, parsed, source: "regex" });
}

function parseLinkedInText(text: string): Record<string, unknown> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Full name: usually the first substantial line (not a URL, not "LinkedIn", not a title)
  const nameLine = lines.find(
    (l) => l.length > 3 && l.length < 60 && !/^(linkedin|http|@|connect|follow|message|view|open to)/i.test(l)
  );
  const fullName = nameLine || null;

  // Current title: often 2nd or 3rd line, or after the name
  const titleLine = lines.find(
    (l, i) => i > 0 && i < 5 && l.length > 5 && l.length < 120 && !/^(linkedin|http|@)/i.test(l) && l !== fullName
  );
  const currentTitle = titleLine || null;

  // Languages: look for "Languages" section
  const langIdx = lines.findIndex((l) => /^languages?$/i.test(l));
  const languages: string[] = [];
  if (langIdx >= 0) {
    for (let i = langIdx + 1; i < Math.min(langIdx + 10, lines.length); i++) {
      const l = lines[i];
      if (/^(skills?|experience|education|certific|about|summary|contact)/i.test(l)) break;
      if (l.length < 40 && /^[A-Z][a-z]/.test(l)) languages.push(l.replace(/\s*[\-–—].+/, "").trim());
    }
  }

  // Skills: look for "Skills" or "Top Skills" section
  const skillsIdx = lines.findIndex((l) => /^(top )?skills?$/i.test(l));
  const skills: string[] = [];
  if (skillsIdx >= 0) {
    for (let i = skillsIdx + 1; i < Math.min(skillsIdx + 20, lines.length); i++) {
      const l = lines[i];
      if (/^(experience|education|certific|about|summary|languages?|contact|volunteer)/i.test(l)) break;
      if (l.length > 2 && l.length < 60 && !/^\d/.test(l)) skills.push(l);
    }
  }

  // Short bio: "About" section
  const aboutIdx = lines.findIndex((l) => /^about$/i.test(l));
  let shortBio: string | null = null;
  if (aboutIdx >= 0 && lines[aboutIdx + 1]) {
    shortBio = lines.slice(aboutIdx + 1, aboutIdx + 4).join(" ").slice(0, 300) || null;
  }

  // Target roles from experience section
  const targetRoles: string[] = [];
  const expIdx = lines.findIndex((l) => /^experience$/i.test(l));
  if (expIdx >= 0) {
    for (let i = expIdx + 1; i < Math.min(expIdx + 30, lines.length); i++) {
      const l = lines[i];
      if (/^(education|certific|skills?|languages?|volunteer|about)/i.test(l)) break;
      // Job titles: often start with capital, not too long, don't look like companies
      if (l.length > 3 && l.length < 80 && /^[A-Z]/.test(l) && !/^\d{4}/.test(l) && !l.includes("·")) {
        if (targetRoles.length < 5 && !targetRoles.includes(l)) targetRoles.push(l);
      }
    }
  }
  if (currentTitle && !targetRoles.includes(currentTitle)) targetRoles.unshift(currentTitle);

  // Location
  const locationLine = lines.find((l) => /\b(new zealand|australia|united states|canada|united kingdom|new york|london|sydney|auckland|melbourne|toronto|vancouver|berlin|amsterdam|paris|dubai|singapore)\b/i.test(l) && l.length < 80);

  return {
    fullName,
    currentTitle,
    currentCompany: null,
    location: locationLine || null,
    languages: languages.slice(0, 6),
    skills: skills.slice(0, 10),
    targetRoles: targetRoles.slice(0, 5),
    shortBio,
    experienceYears: null,
    education: null,
  };
}
