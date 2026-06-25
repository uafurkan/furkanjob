import { NextResponse } from "next/server";
import { listUsers, listApplications, getProfile } from "@/lib/db";
import { isFollowupDue } from "@/lib/applications";
import { sendEmail } from "@/lib/notify";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://paply.me";

function reminderHtml(name: string, companies: string[]): string {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const list = companies.map((c) => `<li style="margin:4px 0">${c}</li>`).join("");
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1a1f29">
    <p style="font-size:15px">${greeting}</p>
    <p style="font-size:15px">
      You have <b>${companies.length}</b> application${companies.length === 1 ? "" : "s"} that
      ${companies.length === 1 ? "hasn't" : "haven't"} received a reply in over 7 days. A brief,
      polite follow-up can double your response rate.
    </p>
    ${list ? `<ul style="font-size:14px;color:#444;padding-left:18px">${list}</ul>` : ""}
    <p style="font-size:15px">
      <a href="${BASE}/app/profile#applications" style="color:#2f6bdc;font-weight:600">
        Send follow-ups →
      </a>
    </p>
    <p style="font-size:12px;color:#8a8f98;margin-top:24px">
      You're receiving this because you have a paply account. Manage your data anytime in your profile.
    </p>
  </div>`;
}

// Daily cron: notify users who have applications due for a follow-up.
// Secured by CRON_SECRET. No-ops without RESEND_API_KEY.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not set" });
    }

    const users = await listUsers();
    let emailed = 0;
    for (const u of users) {
      if (!u.email) continue;
      const [apps, profile] = await Promise.all([listApplications(u.id), getProfile(u.id)]);
      if (profile?.reminderOptOut) continue;
      const due = apps.filter((a) => isFollowupDue(a.status, a.sentAt ?? null, a.createdAt));
      if (!due.length) continue;
      const companies = due.map((a) => a.company || "—");
      const html = reminderHtml((u.name || "").split(" ")[0] || "", companies);
      const ok = await sendEmail({
        to: u.email,
        subject: `Follow up on ${companies.length === 1 ? companies[0] : `${companies.length} applications`} — paply`,
        html,
      });
      if (ok) emailed++;
    }
    return NextResponse.json({ ok: true, emailed, users: users.length });
  } catch (e: any) {
    await reportError(e, { route: "cron/followup-reminder" });
    return NextResponse.json({ error: e?.message || "reminder failed" }, { status: 500 });
  }
}
