import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listApplications, getUsage } from "@/lib/db";
import { planInfo } from "@/lib/plans";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const { t, lang } = getT();
  const user = (await getCurrentUser())!;
  const [apps, used] = await Promise.all([listApplications(user.id), getUsage(user.id)]);
  const limit = planInfo(user.plan).monthlyLimit;
  // Anything that left the outbox counts as sent (sent + later pipeline states), excluding draft/failed.
  const sent = apps.filter((a) => a.status !== "draft" && a.status !== "failed").length;
  const recent = apps.slice(0, 3);

  const firstName = (user.name || "").trim().split(/\s+/)[0];
  const hello = firstName ? t("home.hello").replace("{name}", firstName) : t("home.helloNoName");

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{hello}</h1>
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
        <div className="glass card stat">
          <span className="stat-value" style={{ textTransform: "capitalize" }}>{user.plan}</span>
          <span className="stat-label">{t("home.stat.plan")}</span>
        </div>
      </div>

      {/* Primary action */}
      <Link href="/app/new" className="glass card home-cta">
        <div className="stack gap-1">
          <h2>{t("home.cta.title")}</h2>
          <p className="text-secondary">{t("home.cta.sub")}</p>
        </div>
        <span className="home-cta-arrow" aria-hidden>→</span>
      </Link>

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
