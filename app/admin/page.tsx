import { getAdminStats } from "@/lib/db";

function KPI({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="glass card stack gap-1">
      <span className="field-label">{label}</span>
      <span className="plan-price">{value}</span>
      {hint && <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{hint}</span>}
    </div>
  );
}

function Status({ label, on }: { label: string; on: boolean }) {
  return <span className={`chip ${on ? "chip-ok" : "chip-warn"}`}>{label}: {on ? "on" : "off"}</span>;
}

export default async function AdminOverview() {
  const s = await getAdminStats();
  const mrr = s.proUsers * 12; // € per Pro/mo

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>Overview</h1>
        <p className="text-secondary">Live metrics across all users.</p>
      </header>

      <div className="admin-kpis">
        <KPI label="Users" value={s.users} hint={`${s.proUsers} Pro`} />
        <KPI label="Est. MRR" value={`€${mrr}`} hint="Pro × €12" />
        <KPI label="Applications" value={s.applications} hint={`${s.sent} sent · ${s.failed} failed`} />
        <KPI label="Sent this month" value={s.thisMonthSent} />
        <KPI label="Gmail connected" value={s.gmailConnected} />
      </div>

      <section className="glass card stack gap-3">
        <h3>System status</h3>
        <div className="row gap-2 wrap">
          <Status label="AI (Anthropic)" on={Boolean(process.env.ANTHROPIC_API_KEY)} />
          <Status label="Stripe" on={Boolean(process.env.STRIPE_SECRET_KEY)} />
          <Status label="Google OAuth" on={Boolean(process.env.GOOGLE_CLIENT_ID)} />
          <Status label="SMTP fallback" on={Boolean(process.env.SMTP_APP_PASSWORD)} />
        </div>
      </section>
    </div>
  );
}
