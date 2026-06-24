"use client";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { APP_LANGS } from "@/lib/engine/template";

type GenResult = {
  company: string;
  country: string;
  positions: string[];
  emails: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "none";
  subject: string;
  body: string;
  draftSource: "ai" | "template";
  language: string;
  cv: { filename: string } | null;
  overLimit: boolean;
  plan: string;
  limit: number | null;
  used: number;
};

export default function NewApplication() {
  const { t } = useT();
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [analyzing, setAnalyzing] = useState(false);
  const [res, setRes] = useState<GenResult | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);

  const srcLabel = (s: string) =>
    ({ text: t("new.src.text"), "page-scrape": t("new.src.scrape"), "web-search": t("new.src.web"), none: t("new.src.none") } as Record<string, string>)[s] || s;
  const langLabel = (c: string) => APP_LANGS.find((l) => l.code === c)?.label || c;

  async function analyze() {
    if (!text.trim()) return setMsg({ kind: "warn", text: t("new.pasteFirst") });
    setAnalyzing(true);
    setMsg(null);
    setRes(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      const d: GenResult = await r.json();
      if (!r.ok) throw new Error((d as any).error || "Error");
      setRes(d);
      const toVal = (d.emails || []).join(", ");
      setTo(toVal);
      setSubject(d.subject);
      setBody(d.body);
      if (d.emailSource === "none") {
        setMsg({ kind: "warn", text: t("new.noEmailFound") });
        return;
      }
      if (auto && !d.overLimit && d.emails.length) {
        await doSend({ to: toVal, subject: d.subject, body: d.body, meta: d }, true);
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function doSend(p: { to: string; subject: string; body: string; meta: GenResult }, skipConfirm = false) {
    if (!p.to.trim()) return setMsg({ kind: "err", text: t("new.enterRecipient") });
    if (!skipConfirm && !confirm(`${p.to}\n\n${t("new.send")}?`)) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: p.to, subject: p.subject, body: p.body,
          company: p.meta.company, country: p.meta.country, positions: p.meta.positions,
          emailSource: p.meta.emailSource, draftSource: p.meta.draftSource,
        }),
      });
      const d = await r.json();
      if (r.status === 402) return setMsg({ kind: "warn", text: t("new.limitReached") });
      if (!r.ok) throw new Error(d.error || "Error");
      setMsg({ kind: "ok", text: `${d.sentTo.join(", ")} ${d.cvAttached ? t("new.cvAttached") : t("new.cvNone")}` });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-new stack gap-6">
      <header className="page-head">
        <h1>{t("new.title")}</h1>
        <p className="text-secondary">{t("new.sub")}</p>
      </header>

      <section className="glass card stack gap-4">
        <label className="field">
          <span className="field-label">{t("new.content")}</span>
          <textarea className="textarea" placeholder={t("new.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
        </label>

        <div className="row gap-6 wrap">
          <div className="stack gap-2">
            <span className="field-label">{t("new.mode")}</span>
            <div className="segmented" role="tablist" aria-label={t("new.mode")}>
              <button role="tab" aria-selected={!auto} className={`seg${!auto ? " active" : ""}`} onClick={() => setAuto(false)}>{t("new.semi")}</button>
              <button role="tab" aria-selected={auto} className={`seg${auto ? " active" : ""}`} onClick={() => setAuto(true)}>{t("new.full")}</button>
            </div>
          </div>
          <label className="field" style={{ minWidth: 220 }}>
            <span className="field-label">{t("new.applang")}</span>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="auto">{t("new.applang.auto")}</option>
              {APP_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </div>
        <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{auto ? t("new.fullNote") : t("new.semiNote")}</span>

        <div className="row gap-3 wrap">
          <button className="btn btn-primary" data-loading={analyzing || sending} onClick={analyze} disabled={analyzing || sending}>
            {analyzing ? t("new.analyzing") : sending ? t("new.sending") : auto ? t("new.analyzeSend") : t("new.analyze")}
          </button>
          {res && <span className="chip">{res.draftSource === "ai" ? t("new.aiLabel") : t("new.tmpl")}</span>}
          {res && <span className="chip">{langLabel(res.language)}</span>}
        </div>
      </section>

      {res && (
        <section className="glass card stack gap-4 reveal">
          <div className="row gap-2 wrap">
            <span className="chip chip-accent">{res.company}</span>
            <span className="chip">{res.country}</span>
            {res.positions.map((p) => (
              <span key={p} className="chip">{p}</span>
            ))}
            <span className={`chip ${res.emailSource === "none" ? "chip-warn" : "chip-ok"}`}>{t("new.mail")}: {srcLabel(res.emailSource)}</span>
          </div>

          <label className="field">
            <span className="field-label">{t("new.to")}</span>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@business.com" />
          </label>
          <label className="field">
            <span className="field-label">{t("new.subject")}</span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t("new.body")}</span>
            <textarea className="textarea" style={{ minHeight: 260 }} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          <div className="row gap-3 wrap" style={{ justifyContent: "space-between" }}>
            <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>
              {res.cv ? <>{t("new.attachment")}: <b>{res.cv.filename}</b></> : <span className="chip-warn">{t("new.noCv")}</span>}
            </span>
            <div className="row gap-3">
              {res.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
              <button className="btn btn-primary" data-loading={sending} onClick={() => res && doSend({ to, subject, body, meta: res })} disabled={sending || res.overLimit}>
                {sending ? t("new.sending") : t("new.send")}
              </button>
            </div>
          </div>
        </section>
      )}

      {msg && <div className={`notice notice-${msg.kind} reveal`}>{msg.text}</div>}
    </div>
  );
}
