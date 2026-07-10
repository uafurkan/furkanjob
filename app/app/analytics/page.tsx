"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";

type WeekPoint = { week: string; count: number };
type CountryRow = { country: string; sent: number; replied: number; responseRate: number };
type RoleRow = { role: string; count: number };
type AnalyticsData = {
  total: number;
  totalSent: number;
  totalReplied: number;
  responseRate: number;
  byCountry: CountryRow[];
  byRole: RoleRow[];
  weekSeries: WeekPoint[];
  statusBreakdown: Record<string, number>;
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 8, background: "var(--surface-raised)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

function WeekChart({ series }: { series: WeekPoint[] }) {
  const max = Math.max(...series.map((s) => s.count), 1);
  const barW = `calc(${100 / series.length}% - 4px)`;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, paddingBottom: 20, position: "relative" }}>
      {series.map((p, i) => {
        const h = max > 0 ? Math.round((p.count / max) * 68) : 0;
        const weekNum = p.week.split("-W")[1];
        return (
          <div key={i} title={`Week ${p.week}: ${p.count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "default" }}>
            <div style={{ width: "100%", height: h, background: "var(--accent)", borderRadius: "3px 3px 0 0", minHeight: p.count > 0 ? 3 : 0, transition: "height 0.3s ease" }} />
            {i % 3 === 0 && (
              <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2, whiteSpace: "nowrap" }}>W{weekNum}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics() {
  const { t } = useT();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxCountrySent = data ? Math.max(...data.byCountry.map((c) => c.sent), 1) : 1;
  const maxRole = data ? Math.max(...data.byRole.map((r) => r.count), 1) : 1;

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <div className="row gap-3" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>{t("analytics.title")}</h1>
            <p className="text-secondary">{t("analytics.sub")}</p>
          </div>
          <Link href="/app/applications" className="btn btn-sm btn-ghost">{t("apps.title")} →</Link>
        </div>
      </header>

      {loading && (
        <div className="glass card" style={{ textAlign: "center", padding: "var(--space-8)" }}>
          <span className="spinner" />
        </div>
      )}

      {!loading && !data && (
        <div className="glass card" style={{ textAlign: "center", padding: "var(--space-8)", color: "var(--text-secondary)" }}>
          {t("analytics.noData")}
        </div>
      )}

      {!loading && data && data.total === 0 && (
        <div className="glass card stack gap-3" style={{ textAlign: "center", padding: "var(--space-8)" }}>
          <p className="text-secondary">{t("analytics.noData")}</p>
          <Link href="/app/new" className="btn btn-primary">{t("home.cta.title")}</Link>
        </div>
      )}

      {!loading && data && data.total > 0 && (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-3)" }}>
            {[
              { label: t("analytics.total"), value: data.total, color: "var(--accent)" },
              { label: t("analytics.totalSent"), value: data.totalSent, color: "var(--signal-success, #10b981)" },
              { label: t("analytics.responded"), value: data.totalReplied, color: "var(--accent-alt, #a78bfa)" },
              { label: t("analytics.responseRate"), value: `${data.responseRate}%`, color: data.responseRate >= 20 ? "var(--signal-success, #10b981)" : data.responseRate >= 10 ? "var(--signal-warning, #f59e0b)" : "var(--text-secondary)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass card stack gap-1" style={{ padding: "var(--space-4)" }}>
                <span style={{ fontSize: "var(--text-12)", color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: "var(--text-28)", fontWeight: 700, color, lineHeight: 1.1 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Weekly chart */}
          {data.weekSeries.some((w) => w.count > 0) && (
            <div className="glass card stack gap-3">
              <span className="field-label" style={{ margin: 0 }}>{t("analytics.byWeek")}</span>
              <WeekChart series={data.weekSeries} />
            </div>
          )}

          {/* By country + by role side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" }}>
            {data.byCountry.length > 0 && (
              <div className="glass card stack gap-3">
                <span className="field-label" style={{ margin: 0 }}>{t("analytics.byCountry")}</span>
                <div className="stack gap-3">
                  {data.byCountry.map((c) => (
                    <div key={c.country} className="stack gap-1">
                      <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "var(--text-13)", fontWeight: 500 }}>{c.country}</span>
                        <div className="row gap-2" style={{ alignItems: "center" }}>
                          <span className="chip chip-sm">{c.sent} sent</span>
                          {c.replied > 0 && (
                            <span className="chip chip-sm chip-ok">{c.responseRate}% replied</span>
                          )}
                        </div>
                      </div>
                      <Bar value={c.sent} max={maxCountrySent} color="var(--accent)" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.byRole.length > 0 && (
              <div className="glass card stack gap-3">
                <span className="field-label" style={{ margin: 0 }}>{t("analytics.byRole")}</span>
                <div className="stack gap-3">
                  {data.byRole.map((r) => (
                    <div key={r.role} className="stack gap-1">
                      <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "var(--text-13)", fontWeight: 500 }}>{r.role}</span>
                        <span className="chip chip-sm">{r.count}</span>
                      </div>
                      <Bar value={r.count} max={maxRole} color="var(--accent-alt, #a78bfa)" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          {Object.keys(data.statusBreakdown).length > 0 && (
            <div className="glass card stack gap-3">
              <span className="field-label" style={{ margin: 0 }}>{t("analytics.statusBreakdown")}</span>
              <div className="row gap-2 wrap">
                {Object.entries(data.statusBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <span key={status} className={`chip ${status === "sent" ? "chip-accent" : status === "replied" || status === "interview" || status === "offer" ? "chip-ok" : status === "rejected" || status === "failed" ? "chip-warn" : ""}`}>
                      {t(`apps.status.${status}`) || status}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
