import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

function csvEsc(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const apps = await listApplications(user.id);

    const headers = ["Date", "Company", "Country", "Positions", "Recipients", "Subject", "Status", "Draft", "Source"];
    const rows = apps.map((a) => [
      a.sentAt ? new Date(a.sentAt).toISOString().slice(0, 10) : new Date(a.createdAt).toISOString().slice(0, 10),
      a.company ?? "",
      a.country ?? "",
      a.positions.join("; "),
      a.recipients.join("; "),
      a.subject,
      a.status,
      a.draftSource,
      a.emailSource,
    ]);

    const csv = [headers, ...rows].map((r) => r.map(csvEsc).join(",")).join("\r\n");

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
