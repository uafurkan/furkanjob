"use client";
import { useState, useCallback } from "react";
import { useT } from "@/components/i18n";
import { SETTABLE_STATUSES, PIPELINE_STATUSES, STATUS_CLASS, isFollowupDue } from "@/lib/applications";

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

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

export default function ApplicationsBoard({ initial }: { initial: AppRow[] }) {
  const { t, lang } = useT();
  const [apps, setApps] = useState<AppRow[]>(initial);
  const [fu, setFu] = useState<Followup | null>(null);
  const [loadingFu, setLoadingFu] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppRow | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const copyBody = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const label = (s: string) => t(`apps.status.${s}`);
  const counts = PIPELINE_STATUSES.map((s) => ({ s, n: apps.filter((a) => a.status === s).length }));

  const visible = apps.filter((a) => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.company || "").toLowerCase().includes(q) ||
      (a.country || "").toLowerCase().includes(q) ||
      a.subject.toLowerCase().includes(q) ||
      a.recipients.some((r) => r.toLowerCase().includes(q))
    );
  });

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
      setDetail(null);
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
        <a
          href="/api/applications/export"
          download
          className="btn btn-sm"
          style={{ marginLeft: "auto", fontSize: "var(--text-12)", textDecoration: "none" }}
        >
          {t("apps.export")}
        </a>
      </div>

      {/* Search */}
      <input
        className="input"
        placeholder={t("apps.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ fontSize: "var(--text-14)" }}
      />

      {visible.length === 0 && (search || filterStatus !== "all") && (
        <p className="text-secondary" style={{ fontSize: "var(--text-14)", textAlign: "center", padding: "var(--space-4) 0" }}>
          {t("apps.noResults")}
        </p>
      )}

      <div className="stack gap-3">
        {visible.map((a) => {
          const due = isFollowupDue(a.status, a.sentAt, a.createdAt);
          return (
            <div key={a.id} className="glass card app-row" style={{ cursor: "pointer" }} onClick={() => { setDetail(a); setDetailNotes(a.notes || ""); }}>
              <div className="stack gap-2" style={{ width: "100%" }}>
                <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                  <b>{a.company || "—"}</b>
                  {a.country && <span className="chip">{a.country}</span>}
                  <select
                    className={`status-select ${STATUS_CLASS[a.status] || ""}`}
                    value={SETTABLE_STATUSES.includes(a.status as any) ? a.status : "sent"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); changeStatus(a.id, e.target.value); }}
                  >
                    {SETTABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>{label(s)}</option>
                    ))}
                  </select>
                  {a.status === "failed" && a.body && (
                    <button className="btn btn-sm" data-loading={resending === a.id}
                      onClick={(e) => { e.stopPropagation(); resend(a); }}
                      style={{ marginLeft: "auto" }}>
                      {t("apps.resend")}
                    </button>
                  )}
                  {due && a.status !== "failed" && (
                    <button className="btn btn-sm" data-loading={loadingFu === a.id}
                      onClick={(e) => { e.stopPropagation(); openFollowup(a); }}
                      style={{ marginLeft: "auto" }}>
                      {t("apps.followup")}
                    </button>
                  )}
                </div>
                <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{a.subject}</span>
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
                </div>
                {a.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{a.error}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {msg && <div className={`notice notice-${msg.kind}`}>{msg.text}</div>}

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

      {detail && (
        <div className="confirm-overlay" onClick={() => { setDetail(null); setDetailNotes(""); }}>
          <div className="confirm-modal detail-modal" style={{ maxWidth: 640, width: "94%", maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <div className="stack gap-1">
                <span className="detail-company">{detail.company || "—"}</span>
                {detail.country && <span className="chip" style={{ alignSelf: "start" }}>{detail.country}</span>}
              </div>
              <button className="btn btn-sm btn-danger" style={{ marginLeft: "auto" }} onClick={() => setConfirmDelete(detail)}>{t("apps.delete")}</button>
              <button className="btn btn-sm" onClick={() => { setDetail(null); setDetailNotes(""); }}>{t("apps.detail.close")}</button>
            </div>
            <div className="detail-body stack gap-3">
              <div className="detail-meta-grid">
                <span className="field-label">{t("apps.detail.to")}</span>
                <span className="mono" style={{ fontSize: "var(--text-13)" }}>{detail.recipients.join(", ") || "—"}</span>
                <span className="field-label">{t("new.subject")}</span>
                <span style={{ fontSize: "var(--text-14)" }}>{detail.subject}</span>
                {detail.sentAt && <>
                  <span className="field-label">{t("apps.detail.sent")}</span>
                  <span style={{ fontSize: "var(--text-13)" }}>{new Date(detail.sentAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}</span>
                </>}
                {detail.positions && detail.positions.length > 0 && <>
                  <span className="field-label">{t("apps.detail.positions")}</span>
                  <div className="row gap-1 wrap">{detail.positions.map((p) => <span key={p} className="chip">{p}</span>)}</div>
                </>}
                {detail.emailSource && <>
                  <span className="field-label">{t("apps.detail.source")}</span>
                  <span className="chip">{t(`apps.source.${detail.emailSource}`)}</span>
                </>}
                {detail.draftSource && <>
                  <span className="field-label">{t("apps.detail.draft")}</span>
                  <span className="chip">{t(`apps.draft.${detail.draftSource}`)}</span>
                </>}
              </div>
              {detail.body && (
                <div className="stack gap-2">
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="field-label">{t("apps.detail.body")}</span>
                    <button className="btn btn-sm" style={{ marginLeft: "auto", fontSize: "var(--text-12)" }}
                      onClick={() => copyBody(detail.body || "")}>
                      {copied ? t("apps.detail.copied") : t("apps.detail.copy")}
                    </button>
                  </div>
                  <div className="detail-body-text" dangerouslySetInnerHTML={{ __html: mdToHtml(detail.body) }} />
                </div>
              )}
              <div className="stack gap-2">
                <span className="field-label">{t("apps.detail.notes")}</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 80, fontSize: "var(--text-13)" }}
                  placeholder={t("apps.detail.notesPlaceholder")}
                  value={detailNotes}
                  onChange={(e) => setDetailNotes(e.target.value)}
                />
                <button
                  className="btn btn-sm"
                  data-loading={savingNotes}
                  style={{ alignSelf: "flex-end" }}
                  onClick={async () => {
                    setSavingNotes(true);
                    try {
                      await fetch(`/api/applications/${detail.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ notes: detailNotes }),
                      });
                      setApps((prev) => prev.map((x) => x.id === detail.id ? { ...x, notes: detailNotes } : x));
                      setDetail({ ...detail, notes: detailNotes });
                    } finally {
                      setSavingNotes(false);
                    }
                  }}
                >
                  {t("apps.detail.saveNotes")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
