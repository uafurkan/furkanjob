import { NextResponse } from "next/server";
import { listUsers, listApplications, getProfile } from "@/lib/db";
import { sendEmail } from "@/lib/notify";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://paply.me";

function digestHtml(name: string, sent: number, companies: string[], goal: number): string {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const list = companies.slice(0, 5).map((c) => `<li style="margin:4px 0">${c}</li>`).join("");
  const goalLine = goal > 0
    ? (sent >= goal
        ? `<p style="font-size:15px;color:#1a8f5f">You hit your weekly goal of <b>${goal}</b> 🎉</p>`
        : `<p style="font-size:15px">You're <b>${goal - sent}</b> away from your weekly goal of <b>${goal}</b>.</p>`)
    : "";
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1a1f29">
    <p style="font-size:15px">${greeting}</p>
    <p style="font-size:15px">Here's your week on <b>paply</b>: you sent <b>${sent}</b> application${sent === 1 ? "" : "s"}.</p>
    ${goalLine}
    ${list ? `<ul style="font-size:14px;color:#444;padding-left:18px">${list}</ul>` : ""}
    <p style="font-size:15px"><a href="${BASE}/app/new" style="color:#2f6bdc;font-weight:600">Send another →</a></p>
    <p style="font-size:12px;color:#8a8f98;margin-top:24px">You're receiving this because you have a paply account.
    Manage your data anytime in your profile.</p>
  </div>`;
}

// Weekly digest of each active user's sending activity. Secured by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>` for scheduled invocations). No-ops without RESEND_API_KEY.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not set" });
    }

    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const users = await listUsers();
    let emailed = 0;
    for (const u of users) {
      if (!u.email) continue;
      const [apps, profile] = await Promise.all([listApplications(u.id), getProfile(u.id)]);
      if (profile?.digestOptOut) continue;
      const recent = apps.filter((a) => new Date(a.createdAt).getTime() >= since && a.status === "sent");
      if (!recent.length) continue; // only nudge users who were actually active
      const companies = recent.map((a) => a.company || "—").filter(Boolean);
      const html = digestHtml((u.name || "").split(" ")[0] || "", recent.length, companies, profile?.weeklyGoal ?? 0);
      const ok = await sendEmail({
        to: u.email,
        subject: `Your paply week — ${recent.length} application${recent.length === 1 ? "" : "s"} sent`,
        html,
      });
      if (ok) emailed++;
    }
    return NextResponse.json({ ok: true, emailed, users: users.length });
  } catch (e: any) {
    await reportError(e, { route: "cron/weekly-digest" });
    return NextResponse.json({ error: e?.message || "digest failed" }, { status: 500 });
  }
}
