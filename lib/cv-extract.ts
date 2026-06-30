// Shared PDF text extraction — used by generate pipeline and onboarding.
// Runs in Node (no DOM/canvas) via the legacy pdfjs-dist build.
export async function extractPdfText(buffer: Buffer, maxPages = 5, maxChars = 6000): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text.slice(0, maxChars).trim();
}
