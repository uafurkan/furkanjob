import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", replied: "Replied", interview: "Interview",
  offer: "Offer", rejected: "Rejected", failed: "Failed",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const apps = await listApplications(user.id);
    const sent = apps.filter((a) => a.status !== "draft");

    const date = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

    const lines: string[] = [
      `PAPLY — Application Export`,
      `Generated: ${date}`,
      `Total: ${sent.length} applications`,
      `${"=".repeat(72)}`,
      "",
    ];

    sent.forEach((a, i) => {
      const statusLabel = STATUS_LABEL[a.status] || a.status;
      const sentDate = fmtDate(a.sentAt || a.createdAt);
      const positions = a.positions.length ? a.positions.join(", ") : "—";
      const recipients = a.recipients.length ? a.recipients.join(", ") : "—";

      lines.push(`[${i + 1}] ${a.company || "Unknown"} — ${statusLabel}`);
      lines.push(`Date    : ${sentDate}`);
      lines.push(`To      : ${recipients}`);
      lines.push(`Subject : ${a.subject || "—"}`);
      if (a.country) lines.push(`Country : ${a.country}`);
      if (positions !== "—") lines.push(`Roles   : ${positions}`);
      lines.push("");
      lines.push(a.body || "");
      lines.push("");
      lines.push("-".repeat(72));
      lines.push("");
    });

    if (sent.length === 0) {
      lines.push("No sent applications yet.");
    }

    const txt = lines.join("\n");
    const filename = `paply-applications-${date.replace(/\s+/g, "-")}.txt`;

    return new NextResponse(txt, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    await reportError(e, { route: "applications/export/print" });
    return NextResponse.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
