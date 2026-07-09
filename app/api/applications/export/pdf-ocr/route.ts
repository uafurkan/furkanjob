import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel serverless function cap (Hobby/Pro without Fluid Compute)

// Vercel's serverless functions don't ship a system Chrome and can't fit full puppeteer's
// bundled Chromium (~300MB) in the deployment package. @sparticuz/chromium provides a
// Lambda-compatible binary; locally (where a real Chrome is installed) we fall back to the
// full `puppeteer` package instead, since @sparticuz/chromium's binary is Linux-only.
async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const puppeteer = (await import("puppeteer")).default;
  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
}

const PER_PAGE = 60;

const DRAFT_LABEL: Record<string, string> = {
  template: "Smart Template",
  ai: "AI-Generated",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", replied: "Replied", interview: "Interview",
  offer: "Offer", rejected: "Rejected", failed: "Failed",
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function bodyToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.split(/\n/).map(esc).join("<br>")}</p>`)
    .join("\n");
}

export async function GET(req: Request) {
  let browser: any = null;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const withOcr = searchParams.get("ocr") === "true"; // ?ocr=true for OCR processing

    const apps = await listApplications(user.id);
    const sent = apps.filter((a) => a.status !== "draft");
    const totalPages = Math.max(1, Math.ceil(sent.length / PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const slice = sent.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

    const date = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    const start = (safePage - 1) * PER_PAGE + 1;
    const end = Math.min(safePage * PER_PAGE, sent.length);

    const mailCards = slice.map((a, i) => {
      const draftLabel = DRAFT_LABEL[a.draftSource] || a.draftSource;
      const isAi = a.draftSource === "ai";
      const statusLabel = STATUS_LABEL[a.status] || a.status;
      const sentDate = fmtDate(a.sentAt || a.createdAt);
      const positions = a.positions.length ? a.positions.join(", ") : "—";
      const recipients = a.recipients.length ? a.recipients.join(", ") : "—";

      return `
<div class="mail-card${i < slice.length - 1 ? " page-break" : ""}">
  <div class="mail-header">
    <div class="mail-meta-row">
      <span class="company">${esc(a.company || "Unknown")}</span>
      <span class="badge ${isAi ? "badge-ai" : "badge-template"}">${esc(draftLabel)}</span>
      <span class="badge badge-status">${esc(statusLabel)}</span>
    </div>
    <table class="meta-table">
      <tr><td class="meta-key">Date</td><td class="meta-val">${esc(sentDate)}</td></tr>
      <tr><td class="meta-key">To</td><td class="meta-val">${esc(recipients)}</td></tr>
      <tr><td class="meta-key">Subject</td><td class="meta-val"><strong>${esc(a.subject)}</strong></td></tr>
      ${a.country ? `<tr><td class="meta-key">Country</td><td class="meta-val">${esc(a.country)}</td></tr>` : ""}
      ${positions !== "—" ? `<tr><td class="meta-key">Roles</td><td class="meta-val">${esc(positions)}</td></tr>` : ""}
    </table>
  </div>
  <div class="mail-body">${bodyToHtml(a.body)}</div>
</div>`;
    }).join("\n");

    const navLinks = (() => {
      const links: string[] = [];
      for (let p = 1; p <= totalPages; p++) {
        links.push(
          `<a href="?page=${p}${withOcr ? "&ocr=true" : ""}" class="page-link${p === safePage ? " current" : ""}">${p}</a>`
        );
      }
      return links.join("");
    })();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paply — Emails page ${safePage}/${totalPages} (${date})</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #202124;
    background: #fff;
    padding: 24px 32px;
    max-width: 860px;
    margin: 0 auto;
  }
  .print-header {
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .logo { font-size: 22px; font-weight: 700; color: #1a73e8; letter-spacing: -0.5px; }
  .header-meta { font-size: 12px; color: #666; }
  .mail-card {
    border: 1px solid #e0e0e0; border-radius: 8px;
    margin-bottom: 24px; overflow: hidden;
  }
  .mail-header {
    background: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 18px;
  }
  .mail-meta-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .company { font-size: 15px; font-weight: 600; color: #202124; }
  .badge {
    font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
    padding: 2px 8px; border-radius: 10px; text-transform: uppercase;
  }
  .badge-ai { background: #e8f0fe; color: #1a73e8; }
  .badge-template { background: #e6f4ea; color: #137333; }
  .badge-status { background: #f1f3f4; color: #5f6368; }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 2px 0; vertical-align: top; }
  .meta-key { color: #666; width: 64px; min-width: 64px; padding-right: 12px; font-size: 12px; }
  .meta-val { color: #202124; font-size: 13px; }
  .mail-body { padding: 18px 18px 20px; line-height: 1.6; color: #202124; }
  .mail-body p { margin-bottom: 10px; }
  .mail-body p:last-child { margin-bottom: 0; }
  .page-break { page-break-after: always; }
  .empty { color: #666; text-align: center; padding: 48px; }
</style>
</head>
<body>

<div class="print-header">
  <span class="logo">paply</span>
  <span class="header-meta">${esc(date)} · ${sent.length} total · showing ${start}–${end}${withOcr ? " (OCR)" : ""}</span>
</div>

${totalPages > 1 ? `<div style="margin-bottom:20px;font-size:12px;color:#444;">Page: ${navLinks}</div>` : ""}

${slice.length === 0
  ? `<div class="empty">No sent applications yet.</div>`
  : mailCards
}

</body>
</html>`;

    // Launch a headless browser and render PDF (Puppeteer's PDF output is natively text-searchable).
    browser = await launchBrowser();
    const page_obj = await browser.newPage();
    await page_obj.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page_obj.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await page_obj.close();
    await browser.close();

    const filename = `paply-applications-page${safePage}-of${totalPages}-${date.replace(/\s+/g, "-")}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    await reportError(e, { route: "applications/export/pdf-ocr" });
    return NextResponse.json({ error: e?.message || "PDF export failed" }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
