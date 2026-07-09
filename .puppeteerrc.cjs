// On Vercel we never launch the full `puppeteer` package (see app/api/applications/export/pdf-ocr) —
// it exists only as a local-dev fallback where a real Chrome download is available. Skipping the
// bundled Chromium download keeps that ~300MB binary out of the Vercel build/deployment entirely.
module.exports = {
  skipDownload: Boolean(process.env.VERCEL),
};
