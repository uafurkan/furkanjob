"use client";
import { useState } from "react";
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
};

type Followup = { app: AppRow; to: string; subject: string; body: string; language: string; sending: boolean };

export default function ApplicationsBoard({ initial }: { initial: AppRow[] }) {
  const { t, lang } = useT();
  const [apps, setApps] = useState<AppRow[]>(initial);
  const [fu, setFu] = useState<Followup | null>(null);
  const [loadingFu, setLoadingFu] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const label = (s: string) => t(`apps.status.${s}`);
  const counts = PIPELINE_STATUSES.map((s) => ({ s, n: apps.filter((a) => a.status === s).length }));

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
      setFu({ app, to: (d.to || []).join(", "), subject: d.subject, body: d.body, language: d.language || "en", sending: false });
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
      {/* Pipeline summary */}
      <div className="row gap-2 wrap">
        {counts.map(({ s, n }) => (
          <span key={s} className={`chip ${STATUS_CLASS[s] || ""}`}>{label(s)}: <b style={{ marginLeft: 4 }}>{n}</b></span>
        ))}
      </div>

      <div className="stack gap-3">
        {apps.map((a) => {
          const due = isFollowupDue(a.status, a.sentAt, a.createdAt);
          return (
            <div key={a.id} className="glass card app-row">
              <div className="stack gap-2" style={{ width: "100%" }}>
                <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                  <b>{a.company || "—"}</b>
                  {a.country && <span className="chip">{a.country}</span>}
                  <select
                    className={`status-select ${STATUS_CLASS[a.status] || ""}`}
                    value={SETTABLE_STATUSES.includes(a.status as any) ? a.status : "sent"}
                    onChange={(e) => changeStatus(a.id, e.target.value)}
                  >
                    {SETTABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>{label(s)}</option>
                    ))}
                  </select>
                  {due && (
                    <button className="btn btn-sm" data-loading={loadingFu === a.id} onClick={() => openFollowup(a)} style={{ marginLeft: "auto" }}>
                      {t("apps.followup")}
                    </button>
                  )}
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
    </div>
  );
}
