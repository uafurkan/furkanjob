import { listAllApplications, listUsers } from "@/lib/db";

const STATUS: Record<string, string> = { sent: "chip-ok", failed: "chip-warn", draft: "" };

export default async function AdminApplications() {
  const [apps, users] = await Promise.all([listAllApplications(200), listUsers()]);
  const emailById = Object.fromEntries(users.map((u) => [u.id, u.email]));

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>Applications</h1>
        <p className="text-secondary">Last {apps.length} across all users.</p>
      </header>
      <div className="stack gap-3">
        {apps.map((a) => (
          <div key={a.id} className="glass card stack gap-1">
            <div className="row gap-2 wrap">
              <b>{a.company || "—"}</b>
              <span className={`chip ${STATUS[a.status] || ""}`}>{a.status}</span>
              {a.country && <span className="chip">{a.country}</span>}
              <span className="chip">{a.draftSource}</span>
            </div>
            <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{a.subject}</span>
            <span className="mono text-secondary" style={{ fontSize: "var(--text-12)" }}>
              {emailById[a.userId] || a.userId} → {a.recipients.join(", ") || "—"} · {new Date(a.createdAt).toLocaleString("en-US")}
            </span>
            {a.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{a.error}</span>}
          </div>
        ))}
        {apps.length === 0 && <div className="glass card text-secondary">No applications yet.</div>}
      </div>
    </div>
  );
}
