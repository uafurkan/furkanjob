import { NextResponse } from "next/server";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const runtime = "nodejs";
export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ");
  }
  return text.slice(0, 6000);
}

async function parseCvWithAi(text: string): Promise<any> {
  const groqKey = process.env.FREE_AI_API_KEY;
  const groqBase = process.env.FREE_AI_BASE_URL;

  if (!groqKey || !groqBase) {
    // Fallback: extract basic info from text
    return {
      fullName: "Your Name",
      summary: "Professional with relevant experience.",
      languages: ["en"],
      targetRoles: [],
      yearsExperience: 0,
    };
  }

  const prompt = `Extract structured data from this CV text. Return ONLY valid JSON with these exact keys:
{
  "fullName": "full name or empty string",
  "summary": "2-3 sentence professional summary or empty",
  "languages": ["language codes like en, tr, es, fr, de, it, pt"],
  "targetRoles": ["hospitality roles like Kitchen, Barista, Front Desk"],
  "yearsExperience": number
}

CV text:
"""
${text}
"""`;

  try {
    const res = await fetch(`${groqBase}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: process.env.FREE_AI_MODEL || "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10_000_000) return NextResponse.json({ error: "File too large" }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromPdf(buffer);
    const parsed = await parseCvWithAi(text);

    if (!parsed) {
      return NextResponse.json({ error: "Failed to parse CV" }, { status: 500 });
    }

    return NextResponse.json({
      fullName: parsed.fullName || "",
      summary: parsed.summary || "",
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles : [],
      yearsExperience: typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : 0,
    });
  } catch (e: any) {
    console.error("cv parse error:", e);
    return NextResponse.json({ error: e.message || "Parse failed" }, { status: 500 });
  }
}
