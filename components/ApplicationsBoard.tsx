"use client";
import { useState, useCallback, useEffect } from "react";
import { useT } from "@/components/i18n";
import { SETTABLE_STATUSES, PIPELINE_STATUSES, STATUS_CLASS, isFollowupDue } from "@/lib/applications";

function EmailFinder({ company, recipients }: { company: string | null; recipients: string[] }) {
  const [showDropdown, setShowDropdown] = useState(false);

  const searchOnGoogle = () => {
    const query = company ? `${company} contact email` : "contact email";
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
  };

  return (
    <div style={{ gridColumn: "1 / -1", position: "relative" }}>
      <span
        className="mono"
        style={{
          fontSize: "var(--text-13)",
          cursor: "pointer",
          padding: "4px 6px",
          borderRadius: "4px",
          transition: "background-color 0.2s",
        }}
        onClick={() => setShowDropdown(!showDropdown)}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        {recipients.join(", ") || "—"}
      </span>
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "4px",
            backgroundColor: "rgba(20,24,40,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            padding: "8px 0",
            minWidth: "200px",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={() => {
              searchOnGoogle();
              setShowDropdown(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "none",
              border: "none",
              color: "inherit",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "var(--text-13)",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            🔍 {company ? `${company} contact email` : "Search for contact email"}
          </button>
        </div>
      )}
    </div>
  );
}

export type AppRow = {
  id: string;
  company: string | null;
  country: string | null;
  subject: string;
  recipients: string[];
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  body?: string;
  positions?: string[];
  emailSource?: string;
  draftSource?: string;
  notes?: string | null;
};

type Followup = {
  app: AppRow; to: string; subject: string; body: string; language: string;
  inReplyToId: string | null; threadId: string | null; sending: boolean;
};

function timeSince(dateStr: string | null, lang: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return lang === "tr" ? "Bugün" : "Today";
  if (days === 1) return lang === "tr" ? "Dün" : "Yesterday";
  if (days < 7) return lang === "tr" ? `${days} gün önce` : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return lang === "tr" ? `${weeks} hafta önce` : `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return lang === "tr" ? `${months} ay önce` : `${months}mo ago`;
}

type TLNode = { key: string; date: string | null; state: "done" | "active" | "pending" | "failed" };

// Derive a lifecycle timeline from the data we have (createdAt, sentAt, status).
// Positive progression after "sent": replied → interview → offer. "rejected" is terminal.
const TL_PROGRESSION = ["replied", "interview", "offer"];
function buildTimeline(a: AppRow): TLNode[] {
  const nodes: TLNode[] = [{ key: "drafted", date: a.createdAt, state: "done" }];
  if (a.status === "failed") {
    nodes.push({ key: "failed", date: null, state: "failed" });
    return nodes;
  }
  const sent = Boolean(a.sentAt) || a.status !== "draft";
  nodes.push({ key: "sent", date: a.sentAt, state: sent ? "done" : "pending" });

  if (a.status === "sent" && isFollowupDue(a.status, a.sentAt, a.createdAt)) {
    nodes.push({ key: "followupDue", date: null, state: "active" });
  }
  if (a.status === "rejected") {
    nodes.push({ key: "rejected", date: null, state: "done" });
  } else {
    const idx = TL_PROGRESSION.indexOf(a.status);
    for (let i = 0; i <= idx; i++) {
      nodes.push({ key: TL_PROGRESSION[i], date: null, state: i === idx ? "active" : "done" });
    }
  }
  return nodes;
}

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

// Short plain-text preview of the body for the list row (like a Gmail snippet).
function snippet(body: string | undefined, max = 90): string {
  if (!body) return "";
  const plain = body.replace(/\*\*|\*/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max).trim() + "…" : plain;
}

// ── Reading pane — the right-hand column showing the selected application ──
function ReadingPane({
  app, lang, t, onBack, onDelete, onResend, onFollowup, resending, loadingFu, onNotesSaved,
}: {
  app: AppRow;
  lang: string;
  t: (k: string) => string;
  onBack: () => void;
  onDelete: (a: AppRow) => void;
  onResend: (a: AppRow) => void;
  onFollowup: (a: AppRow) => void;
  resending: string | null;
  loadingFu: string | null;
  onNotesSaved: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState(app.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const due = isFollowupDue(app.status, app.sentAt, app.createdAt);

  const copyBody = useCallback(async () => {
    if (!app.body) return;
    await navigator.clipboard.writeText(app.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [app.body]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      onNotesSaved(app.id, notes);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div className="detail-header-inline">
      <div className="detail-header">
        <button className="btn btn-sm mail-back-btn" onClick={onBack}>{t("apps.detail.back")}</button>
        <div className="stack gap-1 detail-header-title">
          <span className="detail-company">{app.company || "—"}</span>
          {app.country && <span className="chip" style={{ alignSelf: "start" }}>{app.country}</span>}
        </div>
        <div className="row gap-2 wrap detail-header-actions">
          {app.status === "failed" && app.body && (
            <button className="btn btn-sm" data-loading={resending === app.id} onClick={() => onResend(app)}>
              {t("apps.resend")}
            </button>
          )}
          {due && app.status !== "failed" && (
            <button className="btn btn-sm" data-loading={loadingFu === app.id} onClick={() => onFollowup(app)}>
              {t("apps.followup")}
            </button>
          )}
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(app)}>{t("apps.delete")}</button>
        </div>
      </div>
      <div className="detail-body stack gap-3">
        <div className="stack gap-2">
          <span className="field-label">{t("apps.detail.timeline")}</span>
          <ol className="app-timeline">
            {buildTimeline(app).map((n) => (
              <li key={n.key} className={`app-tl-node app-tl-${n.state}`}>
                <span className="app-tl-dot" aria-hidden />
                <span className="app-tl-label">{t(`apps.tl.${n.key}`)}</span>
                {n.date && (
                  <span className="app-tl-date">
                    {new Date(n.date).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { day: "2-digit", month: "short" })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="detail-meta-grid">
          <EmailFinder company={app.company} recipients={app.recipients} />
          <span className="field-label">{t("new.subject")}</span>
          <span style={{ fontSize: "var(--text-14)" }}>{app.subject}</span>
          {app.sentAt && <>
            <span className="field-label">{t("apps.detail.sent")}</span>
            <span style={{ fontSize: "var(--text-13)" }}>{new Date(app.sentAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}</span>
          </>}
          {app.positions && app.positions.length > 0 && <>
            <span className="field-label">{t("apps.detail.positions")}</span>
            <div className="row gap-1 wrap">{app.positions.map((p) => <span key={p} className="chip">{p}</span>)}</div>
          </>}
          {app.emailSource && <>
            <span className="field-label">{t("apps.detail.source")}</span>
            <span className="chip">{t(`apps.source.${app.emailSource}`)}</span>
          </>}
          {app.draftSource && <>
            <span className="field-label">{t("apps.detail.draft")}</span>
            <span className="chip">{t(`apps.draft.${app.draftSource}`)}</span>
          </>}
        </div>
        {app.body && (
          <div className="stack gap-2">
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <span className="field-label">{t("apps.detail.body")}</span>
              <button className="btn btn-sm" style={{ marginLeft: "auto", fontSize: "var(--text-12)" }} onClick={copyBody}>
                {copied ? t("apps.detail.copied") : t("apps.detail.copy")}
              </button>
            </div>
            <div className="detail-body-text" dangerouslySetInnerHTML={{ __html: mdToHtml(app.body) }} />
          </div>
        )}
        <div className="stack gap-2">
          <span className="field-label">{t("apps.detail.notes")}</span>
          <textarea
            className="textarea"
            style={{ minHeight: 80, fontSize: "var(--text-13)" }}
            placeholder={t("apps.detail.notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button className="btn btn-sm" data-loading={savingNotes} style={{ alignSelf: "flex-end" }} onClick={saveNotes}>
            {t("apps.detail.saveNotes")}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function ApplicationsBoard({ initial, initialSelectedId }: { initial: AppRow[]; initialSelectedId?: string }) {
  const { t, lang } = useT();
  const [apps, setApps] = useState<AppRow[]>(initial);
  const [fu, setFu] = useState<Followup | null>(null);
  const [loadingFu, setLoadingFu] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "company" | "status">("date");
  const [filterFollowup, setFilterFollowup] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const label = (s: string) => t(`apps.status.${s}`);
  const counts = PIPELINE_STATUSES.map((s) => ({ s, n: apps.filter((a) => a.status === s).length }));

  const followupCount = apps.filter((a) => isFollowupDue(a.status, a.sentAt, a.createdAt)).length;

  const visible = apps
    .filter((a) => {
      if (filterFollowup && !isFollowupDue(a.status, a.sentAt, a.createdAt)) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (a.company || "").toLowerCase().includes(q) ||
        (a.country || "").toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        (a.body || "").toLowerCase().includes(q) ||
        a.recipients.some((r) => r.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === "company") return (a.company || "").localeCompare(b.company || "");
      if (sortBy === "status") return a.status.localeCompare(b.status);
      // date: newest first (default)
      return new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime();
    });

  const active = visible.find((a) => a.id === selectedId) || null;

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageItems = visible.slice(pageStart, pageStart + pageSize);

  // Reset to page 1 whenever the visible set is re-sliced by a search/filter/sort/page-size change.
  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterFollowup, sortBy, pageSize]);

  // Jump straight to the page containing a deep-linked application (e.g. from the
  // "already applied" duplicate banner), once, on mount.
  useEffect(() => {
    if (!initialSelectedId) return;
    const idx = visible.findIndex((a) => a.id === initialSelectedId);
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [resending, setResending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppRow | null>(null);

  async function resend(a: AppRow) {
    if (!a.body || !a.recipients.length) return;
    setResending(a.id);
    setMsg(null);
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: a.recipients.join(", "),
          subject: a.subject,
          body: a.body,
          company: a.company,
          country: a.country,
          emailSource: a.emailSource || "manual",
          draftSource: a.draftSource || "template",
          recordApplication: false,
        }),
      });
      const d = await r.json();
      if (r.status === 402) { setMsg({ kind: "err", text: t("new.limitReached") }); return; }
      if (!r.ok) throw new Error(d.error || "error");
      setApps((prev) => prev.map((x) => x.id === a.id ? { ...x, status: "sent", error: null, sentAt: new Date().toISOString() } : x));
      setMsg({ kind: "ok", text: t("apps.resenOk") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setResending(null);
    }
  }

  async function changeStatus(id: string, status: string) {
    const prev = apps;
    setApps((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      const r = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setApps(prev);
      setMsg({ kind: "err", text: t("apps.statusFailed") });
    }
  }

  async function deleteApp(id: string) {
    setDeleting(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setApps((prev) => prev.filter((x) => x.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      setConfirmDelete(null);
    } catch {
      setMsg({ kind: "err", text: t("apps.deleteFailed") });
    } finally {
      setDeleting(null);
    }
  }

  async function openFollowup(app: AppRow) {
    setLoadingFu(app.id);
    setMsg(null);
    try {
      const r = await fetch("/api/followup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: app.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "error");
      setFu({
        app, to: (d.to || []).join(", "), subject: d.subject, body: d.body, language: d.language || "en",
        inReplyToId: d.inReplyToId || null, threadId: d.threadId || null, sending: false,
      });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message || t("apps.statusFailed") });
    } finally {
      setLoadingFu(null);
    }
  }

  async function sendFollowup() {
    if (!fu) return;
    setFu({ ...fu, sending: true });
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: fu.to, subject: fu.subject, body: fu.body,
          company: fu.app.company, country: fu.app.country, language: fu.language,
          emailSource: "manual", draftSource: "template",
          inReplyToId: fu.inReplyToId, threadId: fu.threadId, recordApplication: false,
        }),
      });
      const d = await r.json();
      if (r.status === 402) { setMsg({ kind: "err", text: t("new.limitReached") }); setFu(null); return; }
      if (!r.ok) throw new Error(d.error || "error");
      setMsg({ kind: "ok", text: t("apps.followupSent") });
      setFu(null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
      setFu(fu ? { ...fu, sending: false } : null);
    }
  }

  if (!apps.length) return null;

  return (
    <div className="stack gap-3">
      {/* Pipeline summary — clickable filter */}
      <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
        <span
          className={`chip${filterStatus === "all" ? " chip-accent" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setFilterStatus("all")}
        >
          {t("apps.filter.all")}: <b style={{ marginLeft: 4 }}>{apps.length}</b>
        </span>
        {counts.filter(({ n }) => n > 0).map(({ s, n }) => (
          <span
            key={s}
            className={`chip ${filterStatus === s ? "chip-accent" : STATUS_CLASS[s] || ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setFilterStatus((prev) => (prev === s ? "all" : s))}
          >
            {label(s)}: <b style={{ marginLeft: 4 }}>{n}</b>
          </span>
        ))}
        {followupCount > 0 && (
          <span
            className={`chip${filterFollowup ? " chip-accent" : " chip-warn"}`}
            style={{ cursor: "pointer" }}
            onClick={() => setFilterFollowup((prev) => !prev)}
          >
            {t("apps.filter.followup")}: <b style={{ marginLeft: 4 }}>{followupCount}</b>
          </span>
        )}
        <div className="row gap-2" style={{ marginLeft: "auto" }}>
          <a
            href="/api/applications/export"
            download
            className="btn btn-sm"
            style={{ fontSize: "var(--text-12)", textDecoration: "none" }}
          >
            {t("apps.export")}
          </a>
          <a
            href="/api/applications/export/print"
            download
            className="btn btn-sm"
            style={{ fontSize: "var(--text-12)", textDecoration: "none" }}
          >
            {t("apps.exportPdf")}
          </a>
        </div>
      </div>

      {msg && <div className={`notice notice-${msg.kind}`}>{msg.text}</div>}

      {/* Gmail-style two-pane layout: search + list on the left, reading pane on the right. */}
      <div className={`mail-shell${selectedId ? " has-selection" : ""}`}>
        <div className="mail-list-pane">
          <div className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
            <input
              className="input"
              placeholder={t("apps.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: "var(--text-14)", flex: 1 }}
            />
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "company" | "status")}
              style={{ flex: "0 0 auto", width: "auto", fontSize: "var(--text-13)" }}
            >
              <option value="date">{t("apps.sort.date")}</option>
              <option value="company">{t("apps.sort.company")}</option>
              <option value="status">{t("apps.sort.status")}</option>
            </select>
          </div>

          {visible.length === 0 && (search || filterStatus !== "all") && (
            <p className="text-secondary" style={{ fontSize: "var(--text-14)", textAlign: "center", padding: "var(--space-4) 0" }}>
              {t("apps.noResults")}
            </p>
          )}

          {visible.length > 0 && (
            <div className="row gap-2 wrap mail-page-bar" style={{ alignItems: "center" }}>
              <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>
                {t("apps.pageInfo")
                  .replace("{from}", String(pageStart + 1))
                  .replace("{to}", String(Math.min(pageStart + pageSize, visible.length)))
                  .replace("{total}", String(visible.length))}
              </span>
              <select
                className="input"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ marginLeft: "auto", fontSize: "var(--text-12)", width: "auto", padding: "2px 6px" }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} / {t("apps.perPage")}</option>
                ))}
              </select>
              <button className="btn btn-sm" disabled={clampedPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
              <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{clampedPage} / {pageCount}</span>
              <button className="btn btn-sm" disabled={clampedPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>›</button>
            </div>
          )}

          <div className="stack gap-2">
            {pageItems.map((a) => {
              const due = isFollowupDue(a.status, a.sentAt, a.createdAt);
              return (
                <div
                  key={a.id}
                  className={`glass card app-row${a.id === selectedId ? " app-row-active" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedId(a.id)}
                >
                  <div className="stack gap-1" style={{ width: "100%" }}>
                    <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                      <b style={{ fontSize: "var(--text-14)" }}>{a.company || "—"}</b>
                      {SETTABLE_STATUSES.includes(a.status as any) ? (
                        <select
                          className={`status-select ${STATUS_CLASS[a.status] || ""}`}
                          value={a.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { e.stopPropagation(); changeStatus(a.id, e.target.value); }}
                          style={{ marginLeft: "auto" }}
                        >
                          {SETTABLE_STATUSES.map((s) => (
                            <option key={s} value={s}>{label(s)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`chip ${STATUS_CLASS[a.status] || ""}`} style={{ marginLeft: "auto" }}>{label(a.status)}</span>
                      )}
                    </div>
                    <span className="text-secondary" style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>{a.subject}</span>
                    {a.body && (
                      <span className="text-secondary mail-row-snippet" style={{ fontSize: "var(--text-12)" }}>{snippet(a.body)}</span>
                    )}
                    <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                      <span className="mono text-secondary" style={{ fontSize: "var(--text-12)" }}>
                        → {a.recipients.join(", ") || "—"}
                      </span>
                      <span className="text-secondary" style={{ fontSize: "var(--text-12)", marginLeft: "auto" }}>
                        {timeSince(a.sentAt || a.createdAt, lang)}
                      </span>
                      {a.notes && (
                        <span title={a.notes} style={{ fontSize: 14, lineHeight: 1, opacity: .7 }}>📝</span>
                      )}
                      {due && <span className="chip chip-warn" style={{ fontSize: "var(--text-12)" }}>{t("apps.filter.followup")}</span>}
                    </div>
                    {a.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{a.error}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mail-reading-pane">
          {active ? (
            <ReadingPane
              key={active.id}
              app={active}
              lang={lang}
              t={t}
              onBack={() => setSelectedId(null)}
              onDelete={(a) => setConfirmDelete(a)}
              onResend={resend}
              onFollowup={openFollowup}
              resending={resending}
              loadingFu={loadingFu}
              onNotesSaved={(id, notes) => setApps((prev) => prev.map((x) => x.id === id ? { ...x, notes } : x))}
            />
          ) : (
            <div className="mail-reading-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".35">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 6l10 7 10-7" />
              </svg>
              <p className="text-secondary">{t("apps.selectPrompt")}</p>
            </div>
          )}
        </div>
      </div>

      {fu && (
        <div className="confirm-overlay" onClick={() => !fu.sending && setFu(null)}>
          <div className="confirm-modal" style={{ maxWidth: 560, width: "92%" }} onClick={(e) => e.stopPropagation()}>
            <div className="stack gap-3" style={{ padding: "var(--space-2)" }}>
              <p className="confirm-title">{t("apps.followupTitle")}</p>
              <p className="confirm-to">{fu.to}</p>
              <label className="field">
                <span className="field-label">{t("new.subject")}</span>
                <input className="input" value={fu.subject} onChange={(e) => setFu({ ...fu, subject: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">{t("new.body")}</span>
                <textarea className="textarea" style={{ minHeight: 200 }} value={fu.body} onChange={(e) => setFu({ ...fu, body: e.target.value })} />
              </label>
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setFu(null)} disabled={fu.sending}>{t("new.cancel")}</button>
              <button className="btn btn-primary" data-loading={fu.sending} onClick={sendFollowup} disabled={fu.sending}>
                {t("apps.followupSend")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="confirm-modal" style={{ maxWidth: 420, width: "92%" }} onClick={(e) => e.stopPropagation()}>
            <div className="stack gap-3" style={{ padding: "var(--space-4) var(--space-4) var(--space-2)" }}>
              <p className="confirm-title">{t("apps.deleteConfirm")}</p>
              <p className="text-secondary" style={{ fontSize: "var(--text-14)" }}>
                {confirmDelete.company || confirmDelete.subject || "—"}
              </p>
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)} disabled={!!deleting}>{t("new.cancel")}</button>
              <button className="btn btn-danger" data-loading={deleting === confirmDelete.id} onClick={() => deleteApp(confirmDelete.id)} disabled={!!deleting}>
                {t("apps.deleteConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
