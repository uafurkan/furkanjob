import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

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
    .map((para) =>
      `<p>${para
        .split(/\n/)
        .map(esc)
        .join("<br>")}</p>`
    )
    .join("\n");
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const apps = await listApplications(user.id);
    const sent = apps.filter((a) => a.status !== "draft");

    const date = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

    const mailCards = sent.map((a, i) => {
      const draftLabel = DRAFT_LABEL[a.draftSource] || a.draftSource;
      const isAi = a.draftSource === "ai";
      const statusLabel = STATUS_LABEL[a.status] || a.status;
      const sentDate = fmtDate(a.sentAt || a.createdAt);
      const positions = a.positions.length ? a.positions.join(", ") : "—";
      const recipients = a.recipients.length ? a.recipients.join(", ") : "—";

      return `
<div class="mail-card${i < sent.length - 1 ? " page-break" : ""}">
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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paply — Application Emails (${date})</title>
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
    align-items: baseline;
    gap: 16px;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .print-header .logo {
    font-size: 22px;
    font-weight: 700;
    color: #1a73e8;
    letter-spacing: -0.5px;
  }
  .print-header .meta {
    font-size: 12px;
    color: #666;
  }
  .mail-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 28px;
    overflow: hidden;
  }
  .mail-header {
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
    padding: 14px 18px;
  }
  .mail-meta-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .company {
    font-size: 15px;
    font-weight: 600;
    color: #202124;
  }
  .badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
  }
  .badge-ai { background: #e8f0fe; color: #1a73e8; }
  .badge-template { background: #e6f4ea; color: #137333; }
  .badge-status { background: #f1f3f4; color: #5f6368; }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 2px 0; vertical-align: top; }
  .meta-key {
    color: #666;
    width: 64px;
    min-width: 64px;
    padding-right: 12px;
    font-size: 12px;
  }
  .meta-val { color: #202124; font-size: 13px; }
  .mail-body {
    padding: 18px 18px 20px;
    line-height: 1.6;
    color: #202124;
  }
  .mail-body p { margin-bottom: 10px; }
  .mail-body p:last-child { margin-bottom: 0; }
  .page-break { page-break-after: always; }
  .empty { color: #666; text-align: center; padding: 48px; }

  @media print {
    body { padding: 0; max-width: 100%; }
    .no-print { display: none !important; }
    .page-break { page-break-after: always; }
  }
</style>
</head>
<body>
<div class="print-header">
  <span class="logo">paply</span>
  <span class="meta">Application emails — exported ${esc(date)} · ${sent.length} mail${sent.length !== 1 ? "s" : ""}</span>
  <button class="no-print" onclick="window.print()" style="margin-left:auto;padding:6px 16px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Save as PDF</button>
</div>
${sent.length === 0
  ? `<div class="empty">No sent applications yet.</div>`
  : mailCards
}
<script>
  // Auto-open print dialog so one click is enough
  window.addEventListener("load", () => window.print());
</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    await reportError(e, { route: "applications/export/print" });
    return NextResponse.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
