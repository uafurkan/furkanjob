import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listApplications, getUsage, getProfile, getDefaultCv, getDefaultEmailAccount } from "@/lib/db";
import { planInfo } from "@/lib/plans";
import { getT } from "@/lib/i18n-server";
import { isFollowupDue, computeInsights } from "@/lib/applications";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const { t, lang } = getT();
  const user = (await getCurrentUser())!;
  const [apps, used, profile, cv, account] = await Promise.all([
    listApplications(user.id),
    getUsage(user.id),
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
  ]);
  const limit = planInfo(user.plan).monthlyLimit;
  const sent = apps.filter((a) => a.status !== "draft" && a.status !== "failed").length;
  const recent = apps.slice(0, 3);
  const followupDue = apps.filter((a) => isFollowupDue(a.status, a.sentAt ?? null, a.createdAt)).length;

  const firstName = (user.name || "").trim().split(/\s+/)[0];
  const hello = firstName ? t("home.hello").replace("{name}", firstName) : t("home.helloNoName");

  // Contextual nudges — ordered by importance
  const nudges: { key: string; href: string; cta: string }[] = [];
  if (!cv) nudges.push({ key: "home.nudge.cv", href: "/app/profile", cta: t("home.nudge.ctaProfile") });
  if (!account?.provider) nudges.push({ key: "home.nudge.gmail", href: "/app/profile", cta: t("home.nudge.ctaProfile") });
  if (!profile?.fullName) nudges.push({ key: "home.nudge.profile", href: "/app/profile", cta: t("home.nudge.ctaProfile") });
  if (followupDue > 0) nudges.push({ key: "home.nudge.followup", href: "/app/profile#applications", cta: t("home.nudge.ctaApps") });

  // Response rate (only if ≥ 3 dispatched applications to be meaningful)
  const ins = computeInsights(apps);
  const showRate = ins.dispatched >= 3;
  const responsePct = Math.round(ins.responseRate * 100);

  // Last 7 days sparkline (count by day)
  const now7 = Date.now();
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now7 - (6 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { weekday: "short" }),
      count: apps.filter((a) => (a.sentAt || a.createdAt).startsWith(key) && a.status !== "draft" && a.status !== "failed").length,
    };
  });
  const maxDay = Math.max(...days7.map((d) => d.count), 1);

  // Weekly goal progress (week starts Monday, local-ish via UTC date keys)
  const weeklyGoal = profile?.weeklyGoal ?? 0;
  const startOfWeek = (() => {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - day);
    return d.getTime();
  })();
  const weekSent = apps.filter((a) => {
    if (a.status === "draft" || a.status === "failed") return false;
    return new Date(a.sentAt || a.createdAt).getTime() >= startOfWeek;
  }).length;
  const goalPct = weeklyGoal > 0 ? Math.min(100, Math.round((weekSent / weeklyGoal) * 100)) : 0;
  const goalMet = weeklyGoal > 0 && weekSent >= weeklyGoal;

  // Current streak: consecutive days (ending today or yesterday) with ≥1 dispatched application.
  const sentDays = new Set(
    apps
      .filter((a) => a.status !== "draft" && a.status !== "failed")
      .map((a) => (a.sentAt || a.createdAt).slice(0, 10)),
  );
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    if (sentDays.has(key)) streak++;
    else if (i > 0) break; // allow today to be empty without breaking the run
  }

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>{hello}</h1>
          {streak >= 2 && (
            <span className="chip chip-accent" title={t("home.streak.title")}>
              🔥 {t("home.streak.days").replace("{n}", String(streak))}
            </span>
          )}
        </div>
        <p className="text-secondary">{t("home.tagline")}</p>
      </header>

      {/* Quick stats */}
      <div className="stat-grid">
        <div className="glass card stat">
          <span className="stat-value">
            {used}{limit === Infinity ? "" : <span className="stat-sub">/{limit}</span>}
          </span>
          <span className="stat-label">{t("home.stat.month")}</span>
        </div>
        <div className="glass card stat">
          <span className="stat-value">{sent}</span>
          <span className="stat-label">{t("home.stat.sent")}</span>
        </div>
        {showRate ? (
          <div className="glass card stat">
            <span className="stat-value">{responsePct}<span className="stat-sub">%</span></span>
            <span className="stat-label">{t("home.stat.responseRate")}</span>
          </div>
        ) : (
          <div className="glass card stat">
            <span className="stat-value" style={{ textTransform: "capitalize" }}>{user.plan}</span>
            <span className="stat-label">{t("home.stat.plan")}</span>
          </div>
        )}
      </div>

      {/* Weekly goal progress */}
      {weeklyGoal > 0 && (
        <section className="glass card stack gap-3">
          <div className="row gap-2" style={{ alignItems: "baseline" }}>
            <h2 className="section-title" style={{ margin: 0 }}>{t("home.goal.title")}</h2>
            <span className="text-secondary" style={{ marginLeft: "auto", fontSize: "var(--text-13)" }}>
              {goalMet ? t("home.goal.met") : t("home.goal.progress").replace("{n}", String(weekSent)).replace("{goal}", String(weeklyGoal))}
            </span>
          </div>
          <div className="breakdown-track" style={{ height: 10 }}>
            <div className="breakdown-bar" style={{ width: `${goalPct}%`, background: goalMet ? "var(--signal-success)" : undefined }} />
          </div>
        </section>
      )}

      {/* Contextual nudges (top 2 max) */}
      {nudges.slice(0, 2).map((n) => (
        <div key={n.key} className="glass card home-nudge">
          <span style={{ fontSize: "var(--text-14)" }}>{t(n.key)}</span>
          <Link href={n.href} className="btn btn-sm" style={{ whiteSpace: "nowrap" }}>{n.cta}</Link>
        </div>
      ))}

      {/* Primary action */}
      <Link href="/app/new" className="glass card home-cta">
        <div className="stack gap-1">
          <h2>{t("home.cta.title")}</h2>
          <p className="text-secondary">{t("home.cta.sub")}</p>
        </div>
        <span className="home-cta-arrow" aria-hidden>→</span>
      </Link>

      {/* Country / role breakdown (only once there's enough data) */}
      {ins.byCountry.length >= 2 && (
        <section className="glass card stack gap-3">
          <h2 className="section-title" style={{ margin: 0 }}>{t("home.breakdown.title")}</h2>
          <div className="stack gap-2">
            {ins.byCountry.map((row) => {
              const pct = Math.round((row.count / ins.dispatched) * 100);
              return (
                <div key={row.name} className="breakdown-row">
                  <span className="breakdown-label">{row.name}</span>
                  <div className="breakdown-track">
                    <div className="breakdown-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="breakdown-val">{row.count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7-day sparkline — only when there's been activity */}
      {sent >= 2 && (
        <section className="glass card stack gap-3">
          <h2 className="section-title" style={{ margin: 0 }}>{t("home.week.title")}</h2>
          <div className="spark-row">
            {days7.map((d, i) => (
              <div key={i} className="spark-col">
                <div className="spark-bar-wrap">
                  <div
                    className="spark-bar"
                    style={{ height: `${Math.round((d.count / maxDay) * 100)}%` }}
                    title={`${d.count}`}
                  />
                </div>
                <span className="spark-label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity peek (full list lives in Profile) */}
      <section className="stack gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <h2 className="section-title">{t("home.recent")}</h2>
          {apps.length > 0 && (
            <Link href="/app/profile#applications" className="text-secondary" style={{ fontSize: "var(--text-13)", marginLeft: "auto" }}>
              {t("home.viewAll")} →
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="glass card empty">
            <p className="text-secondary" style={{ margin: 0 }}>{t("home.recentEmpty")}</p>
          </div>
        ) : (
          <div className="stack gap-2">
            {recent.map((a) => (
              <Link key={a.id} href="/app/profile#applications" className="home-recent-row">
                <span className="home-recent-dot" data-status={a.status} aria-hidden />
                <b>{a.company || "—"}</b>
                {a.country && <span className="home-recent-sub text-secondary">{a.country}</span>}
                <span className="home-recent-date">
                  {new Date(a.createdAt).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { day: "2-digit", month: "short" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
