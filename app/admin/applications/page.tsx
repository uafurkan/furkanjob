import { listAllApplications, listUsers } from "@/lib/db";

const STATUS: Record<string, string> = { sent: "chip-ok", failed: "chip-warn", draft: "" };

export default async function AdminApplications({ searchParams }: { searchParams?: { user?: string; status?: string } }) {
  const [apps, users] = await Promise.all([listAllApplications(500), listUsers()]);
  const emailById = Object.fromEntries(users.map((u) => [u.id, u.email]));
  const idByEmail = Object.fromEntries(users.map((u) => [u.email.toLowerCase(), u.id]));

  const filterUser = searchParams?.user?.toLowerCase() || "";
  const filterStatus = searchParams?.status || "";

  const filtered = apps.filter((a) => {
    if (filterUser && !(emailById[a.userId] || "").toLowerCase().includes(filterUser)) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const statuses = ["sent", "failed", "draft", "replied", "interview", "offer", "rejected"];

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>Applications</h1>
        <p className="text-secondary">{filtered.length} of {apps.length} across all users.</p>
      </header>

      <form className="row gap-3 wrap" style={{ alignItems: "center" }}>
        <input
          name="user"
          defaultValue={searchParams?.user || ""}
          placeholder="Filter by user email…"
          className="input"
          style={{ flex: "1 1 200px", fontSize: "var(--text-14)" }}
        />
        <select
          name="status"
          defaultValue={searchParams?.status || ""}
          className="input"
          style={{ flex: "0 0 auto", fontSize: "var(--text-14)" }}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-sm">Filter</button>
        {(filterUser || filterStatus) && (
          <a href="/admin/applications" className="btn btn-sm btn-ghost">Clear</a>
        )}
      </form>

      <div className="stack gap-3">
        {filtered.map((a) => (
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
        {filtered.length === 0 && <div className="glass card text-secondary">No applications match.</div>}
      </div>
    </div>
  );
}
