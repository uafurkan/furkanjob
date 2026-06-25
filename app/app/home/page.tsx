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
  const recent = apps.slice(0, 5);

  const status = (s: string) =>
    ({ sent: { l: t("apps.status.sent"), c: "chip-ok" }, failed: { l: t("apps.status.failed"), c: "chip-warn" }, draft: { l: t("apps.status.draft"), c: "" } } as Record<string, { l: string; c: string }>)[s] || { l: s, c: "" };

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>paply</h1>
        <p className="text-secondary">
          {used}{limit === Infinity ? "" : ` / ${limit}`} {t("apps.thisMonth")} · {user.plan}
        </p>
      </header>

      {/* Quick action */}
      <Link href="/app/new" className="btn btn-primary" style={{ alignSelf: "start" }}>
        + {t("nav.new")}
      </Link>

      {/* Recent applications */}
      <section className="stack gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <h2 style={{ fontSize: "var(--text-16)", fontWeight: 600, margin: 0 }}>{t("apps.title")}</h2>
          {apps.length > 5 && (
            <Link href="/app/profile#applications" className="text-secondary" style={{ fontSize: "var(--text-13)", marginLeft: "auto" }}>
              {t("apps.title")} →
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="glass card stack gap-3 empty">
            <h3>{t("apps.empty.title")}</h3>
            <p className="text-secondary">{t("apps.empty.sub")}</p>
          </div>
        ) : (
          <div className="stack gap-3">
            {recent.map((a) => {
              const st = status(a.status);
              return (
                <div key={a.id} className="glass card app-row">
                  <div className="stack gap-1">
                    <div className="row gap-2 wrap">
                      <b>{a.company || "—"}</b>
                      <span className={`chip ${st.c}`}>{st.l}</span>
                      {a.country && <span className="chip">{a.country}</span>}
                    </div>
                    <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{a.subject}</span>
                    <span className="mono text-secondary" style={{ fontSize: "var(--text-12)" }}>
                      → {a.recipients.join(", ") || "—"} · {new Date(a.createdAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}
                    </span>
                    {a.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{a.error}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
