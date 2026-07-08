import { getCurrentUser } from "@/lib/session";
import { listApplications, getUsage } from "@/lib/db";
import { computeInsights } from "@/lib/applications";
import { planInfo } from "@/lib/plans";
import { getT } from "@/lib/i18n-server";
import ApplicationsBoard from "@/components/ApplicationsBoard";
import Link from "next/link";

export const metadata = { title: "Pmail" };

export default async function PmailPage({ searchParams }: { searchParams?: { id?: string } }) {
  const { t } = getT();
  const user = (await getCurrentUser())!;
  const [apps, used] = await Promise.all([
    listApplications(user.id),
    getUsage(user.id),
  ]);
  const limit = planInfo(user.plan).monthlyLimit;

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{t("apps.title")}</h1>
        <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>
          {used}{limit === Infinity ? "" : ` / ${limit}`} {t("apps.thisMonth")}
        </span>
      </header>

      {apps.length === 0 ? (
        <div className="glass card stack gap-3 empty">
          <h3>{t("apps.empty.title")}</h3>
          <p className="text-secondary">{t("apps.empty.sub")}</p>
          <Link href="/app/new" className="btn btn-primary" style={{ alignSelf: "start" }}>{t("apps.new")}</Link>
        </div>
      ) : (
        <>
          {(() => {
            const ins = computeInsights(apps);
            if (ins.dispatched === 0) return null;
            const pct = Math.round(ins.responseRate * 100);
            return (
              <div className="glass card stack gap-4">
                <h3 style={{ margin: 0 }}>{t("insights.title")}</h3>
                <div className="stat-grid">
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{pct}<span className="stat-sub">%</span></span>
                    <span className="stat-label">{t("insights.responseRate")}</span>
                  </div>
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{ins.interview}</span>
                    <span className="stat-label">{t("apps.status.interview")}</span>
                  </div>
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{ins.offer}</span>
                    <span className="stat-label">{t("apps.status.offer")}</span>
                  </div>
                </div>
                {(ins.byCountry.length > 0 || ins.byRole.length > 0) && (
                  <div className="insights-cols">
                    {ins.byCountry.length > 0 && (
                      <div className="stack gap-2">
                        <span className="field-label">{t("insights.byCountry")}</span>
                        {ins.byCountry.map((r) => (
                          <div key={r.name} className="insight-bar-row">
                            <span className="insight-bar-name">{r.name}</span>
                            <span className="insight-bar-track"><span className="insight-bar-fill" style={{ width: `${Math.max(6, Math.round((r.responded / r.count) * 100))}%` }} /></span>
                            <span className="insight-bar-num">{r.responded}/{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ins.byRole.length > 0 && (
                      <div className="stack gap-2">
                        <span className="field-label">{t("insights.byRole")}</span>
                        {ins.byRole.map((r) => (
                          <div key={r.name} className="insight-bar-row">
                            <span className="insight-bar-name">{r.name}</span>
                            <span className="insight-bar-track"><span className="insight-bar-fill" style={{ width: `${Math.max(6, Math.round((r.responded / r.count) * 100))}%` }} /></span>
                            <span className="insight-bar-num">{r.responded}/{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("insights.note")}</span>
              </div>
            );
          })()}
          <ApplicationsBoard
            initialSelectedId={searchParams?.id}
            initial={apps.map((a) => ({
              id: a.id, company: a.company ?? null, country: a.country ?? null, subject: a.subject,
              recipients: a.recipients, status: a.status, error: a.error ?? null,
              createdAt: a.createdAt, sentAt: a.sentAt ?? null,
              body: a.body, positions: a.positions,
              emailSource: a.emailSource, draftSource: a.draftSource,
              notes: a.notes ?? null,
            }))}
          />
        </>
      )}
    </div>
  );
}
