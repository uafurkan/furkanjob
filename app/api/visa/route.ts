import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addDocument } from "@/lib/db";
import { aiAnalyzeVisa, aiEnabled } from "@/lib/engine/ai";
import { aiTier } from "@/lib/plans";
import { resolveVisaCountries, sanitizeCountryCodes, visaTypeById } from "@/lib/engine/visa";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

// Upload a visa/permit document → store it → (if PDF + AI configured) suggest type & covered countries.
// The user always confirms/edits the suggestion in the UI — nothing is auto-trusted.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "upload");
    if (!rl.ok) return NextResponse.json({ error: "Çok fazla yükleme. Biraz bekleyin." }, { status: 429 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Dosya yok." }, { status: 400 });

    const f = file as File;
    if (f.size > 10_000_000) return NextResponse.json({ error: "Dosya çok büyük." }, { status: 413 });
    const buf = Buffer.from(await f.arrayBuffer());
    const safeName = f.name.replace(/[^\w.\-]+/g, "_") || "visa";

    const doc = await addDocument({
      userId: user.id,
      type: "visa",
      filename: safeName,
      mime: f.type || "application/octet-stream",
      size: buf.length,
      dataB64: buf.toString("base64"),
      replace: true, // a user has one visa proof; uploading a new one supersedes the old
    });

    // AI suggestion (PDF only — images would need vision, which we don't run here).
    let suggestion: { visaType: string | null; label: string | null; countries: string[] } | null = null;
    const isPdf = (f.type || "").includes("pdf") || /\.pdf$/i.test(safeName);
    if (isPdf && aiEnabled()) {
      const text = await extractPdfText(buf);
      if (text.trim().length > 20) {
        const ai = await aiAnalyzeVisa(text, aiTier(user.plan));
        if (ai) {
          const preset = visaTypeById(ai.visaTypeId);
          // Prefer AI's explicit codes; else fall back to the preset's coverage.
          const codes = sanitizeCountryCodes(ai.countries?.length ? ai.countries : resolveVisaCountries(ai.visaTypeId));
          suggestion = {
            visaType: preset?.id || (ai.visaTypeId || null),
            label: ai.label || preset?.label || null,
            countries: codes,
          };
        }
      }
    }

    return NextResponse.json({
      ok: true,
      document: { id: doc.id, filename: doc.filename, size: doc.size, type: doc.type },
      suggestion,
      aiAvailable: aiEnabled() && isPdf,
    });
  } catch (e: any) {
    console.error("visa upload error:", e);
    return NextResponse.json({ error: e.message || "Visa upload failed" }, { status: 500 });
  }
}
