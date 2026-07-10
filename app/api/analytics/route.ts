import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listApplications } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apps = await listApplications(user.id);

  // By country
  const countryMap: Record<string, { sent: number; replied: number }> = {};
  // By week (last 12 weeks)
  const weekMap: Record<string, number> = {};
  // By status
  const statusMap: Record<string, number> = {};
  // By role
  const roleMap: Record<string, number> = {};

  const now = new Date();
  const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 3600 * 1000);

  for (const app of apps) {
    const country = app.country || "Unknown";
    if (!countryMap[country]) countryMap[country] = { sent: 0, replied: 0 };
    if (app.status === "sent" || app.status === "replied" || app.status === "interview" || app.status === "offer" || app.status === "rejected") {
      countryMap[country].sent++;
    }
    const responded = ["replied", "interview", "offer", "rejected"].includes(app.status);
    if (responded) countryMap[country].replied++;

    // Status breakdown
    statusMap[app.status] = (statusMap[app.status] || 0) + 1;

    // Roles
    const positions = Array.isArray(app.positions) ? app.positions : [];
    for (const role of positions) {
      roleMap[role] = (roleMap[role] || 0) + 1;
    }

    // Weekly buckets (last 12 weeks only)
    const sentAt = app.sentAt ? new Date(app.sentAt) : (app.createdAt ? new Date(app.createdAt) : null);
    if (sentAt && sentAt >= twelveWeeksAgo) {
      // ISO week label: YYYY-WNN
      const weekLabel = getISOWeekLabel(sentAt);
      weekMap[weekLabel] = (weekMap[weekLabel] || 0) + 1;
    }
  }

  // Build weekly series for last 12 weeks
  const weekSeries: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 3600 * 1000);
    const label = getISOWeekLabel(d);
    weekSeries.push({ week: label, count: weekMap[label] || 0 });
  }

  // Top countries (by sent count)
  const byCountry = Object.entries(countryMap)
    .filter(([, v]) => v.sent > 0)
    .sort(([, a], [, b]) => b.sent - a.sent)
    .slice(0, 10)
    .map(([country, v]) => ({
      country,
      sent: v.sent,
      replied: v.replied,
      responseRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0,
    }));

  // Top roles (by application count)
  const byRole = Object.entries(roleMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([role, count]) => ({ role, count }));

  // Overall response rate
  const totalSent = apps.filter((a) =>
    ["sent", "replied", "interview", "offer", "rejected"].includes(a.status)
  ).length;
  const totalReplied = apps.filter((a) =>
    ["replied", "interview", "offer", "rejected"].includes(a.status)
  ).length;

  return NextResponse.json({
    total: apps.length,
    totalSent,
    totalReplied,
    responseRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
    byCountry,
    byRole,
    weekSeries,
    statusBreakdown: statusMap,
  });
}

function getISOWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
