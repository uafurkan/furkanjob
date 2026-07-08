import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

function csvEsc(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  // Always quote: guards against Excel treating a bare leading "+"/"="/"-" as a formula,
  // and keeps every field readable/consistent regardless of its own content.
  return `"${s.replace(/"/g, '""')}"`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", replied: "Replied", interview: "Interview",
  offer: "Offer", rejected: "Rejected", failed: "Failed",
};
const DRAFT_LABEL: Record<string, string> = { template: "Smart template", ai: "AI-generated" };
const SOURCE_LABEL: Record<string, string> = {
  text: "Pasted text", "page-scrape": "Page scrape", "web-search": "Web search",
  manual: "Manual", none: "None",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const apps = await listApplications(user.id);

    const headers = ["Date", "Company", "Country", "Positions", "Recipients", "Subject", "Status", "Draft method", "Email source"];
    const rows = apps.map((a) => [
      fmtDate(a.sentAt || a.createdAt),
      a.company || "—",
      a.country || "—",
      a.positions.length ? a.positions.join(" | ") : "—",
      a.recipients.length ? a.recipients.join(" | ") : "—",
      a.subject,
      STATUS_LABEL[a.status] || a.status,
      DRAFT_LABEL[a.draftSource] || a.draftSource,
      SOURCE_LABEL[a.emailSource] || a.emailSource,
    ]);

    // "sep=," tells Excel to use a comma delimiter regardless of the OS regional list
    // separator (many non-US locales default to ";", which otherwise mangles every column
    // after the first into one cell). The UTF-8 BOM stops Excel from mis-decoding accented
    // characters and dashes as Windows-1252 (garbled "â€""-style mojibake).
    const csv =
      "\uFEFF" + "sep=,\r\n" +
      [headers, ...rows].map((r) => r.map(csvEsc).join(",")).join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="paply-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    await reportError(e, { route: "applications/export" });
    return NextResponse.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
