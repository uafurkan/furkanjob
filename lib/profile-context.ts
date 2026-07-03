// Loads EVERYTHING the user has uploaded — default CV, visa document, certificates, diplomas,
// experience letters — extracts their text server-side, and attaches it to the EngineProfile.
// This is what lets every AI feature (drafts, cover letter, fit assessment, the coach chat)
// actually KNOW the user: their real experience from the CV, their real visa document, their
// real qualifications — instead of only the short profile form. One enricher, used by every
// AI route, so no feature ever sees less context than another.
import { getDefaultCv, getCvData, listDocuments, getDocumentData } from "./db";
import { extractPdfText } from "./cv-extract";
import type { EngineProfile } from "./engine/types";

const DOC_LABEL: Record<string, string> = {
  visa: "VISA / WORK-AUTHORIZATION DOCUMENT",
  certificate: "CERTIFICATE",
  diploma: "DIPLOMA / DEGREE",
  experience: "EXPERIENCE / REFERENCE LETTER",
  other: "SUPPORTING DOCUMENT",
};

const MAX_DOCS = 5;            // most-recent documents read per request
const PER_DOC_CHARS = 1500;    // text cap per document
const TOTAL_DOC_CHARS = 5000;  // overall cap so prompts stay fast and focused

// Mutates nothing: returns the same profile object shape with cvText/documentsText filled in.
// Every step is best-effort — a corrupt PDF or missing file never breaks generation.
export async function enrichProfileWithDocuments(userId: string, profile: EngineProfile): Promise<EngineProfile> {
  const enriched: EngineProfile = { ...profile };

  // 1. Default CV → full text extract (the single most important document).
  if (!enriched.cvText) {
    try {
      const cv = await getDefaultCv(userId);
      if (cv?.id) {
        const buf = await getCvData(cv.id);
        if (buf) enriched.cvText = await extractPdfText(buf);
      }
    } catch {
      // non-fatal — profile form data still carries the application
    }
  }

  // 2. Every other uploaded document (visa proof, certificates, diplomas, reference letters):
  //    extract each PDF's text with a per-type label so the AI knows WHAT it is reading.
  try {
    const docs = await listDocuments(userId);
    const parts: string[] = [];
    let total = 0;
    for (const doc of docs.slice(0, MAX_DOCS)) {
      if (total >= TOTAL_DOC_CHARS) break;
      if (!/pdf/i.test(doc.mime)) continue; // images would need OCR — skip, the structured profile still covers them
      try {
        const found = await getDocumentData(doc.id, userId);
        if (!found) continue;
        const text = (await extractPdfText(found.bytes, 3, PER_DOC_CHARS)).trim();
        if (!text) continue;
        const label = DOC_LABEL[doc.type] || DOC_LABEL.other;
        const chunk = `[${label}: ${doc.filename}]\n${text}`;
        parts.push(chunk.slice(0, Math.min(chunk.length, TOTAL_DOC_CHARS - total)));
        total += chunk.length;
      } catch {
        // one unreadable document never blocks the rest
      }
    }
    enriched.documentsText = parts.length ? parts.join("\n\n") : null;
  } catch {
    enriched.documentsText = null;
  }

  return enriched;
}
