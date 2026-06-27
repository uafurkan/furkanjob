"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";

type Status = "queued" | "analyzing" | "drafted" | "sending" | "sent" | "failed" | "skipped";

type Item = {
  id: number;
  input: string;
  status: Status;
  company?: string;
  country?: string;
  emailSource?: string;
  to: string;
  subject: string;
  body: string;
  coverLetterBody?: string;
  includeCoverLetter?: boolean;
  language?: string;
  positions?: string[];
  overLimit?: boolean;
  error?: string;
  expanded?: boolean;
  showInlinePreview?: boolean;
  fullName?: string;
  signatureChecked?: boolean;
};

const MAX_ITEMS = 20;

// Split the textarea into items: separated by a line of dashes, or — if there are none —
// one URL/domain/email per line, otherwise the whole text is a single item.
function parseItems(raw: string): string[] {
  const byDash = raw.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (byDash.length > 1) return byDash.slice(0, MAX_ITEMS);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const allUrlsOrEmails = lines.every((l) => !/\s/.test(l) && (l.includes(".") || l.includes("@")));
    if (allUrlsOrEmails) return lines.slice(0, MAX_ITEMS);
  }
  const single = raw.trim();
  return single ? [single] : [];
}

export default function BulkApply() {
  const { t } = useT();
  const [raw, setRaw] = useState("");
  const [auto, setAuto] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [previewItemIndex, setPreviewItemIndex] = useState<number | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    try {
      const coverPref = localStorage.getItem("paply:pref:includeCoverLetter");
      if (coverPref !== null) {
        setIncludeCoverLetter(coverPref === "true");
      }
    } catch {}
  }, []);

  function update(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function analyzeItem(it: Item): Promise<Item> {
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: it.input, language }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "error");

      let isSigChecked = d.includeSignature || false;
      try {
        const sigPref = localStorage.getItem("paply:pref:includeSignature");
        if (sigPref !== null) {
          isSigChecked = sigPref === "true";
        }
      } catch {}

      const fullName = d.fullName || "";
      let initialBody = d.body;
      if (isSigChecked && fullName && !initialBody.includes("Sincerely,")) {
        initialBody = initialBody.trim() + `\n\nSincerely,\n${fullName}`;
      }

      return {
        ...it,
        status: d.emailSource === "none" ? "skipped" : "drafted",
        company: d.company, country: d.country, emailSource: d.emailSource,
        to: (d.emails || []).join(", "), subject: d.subject, body: initialBody,
        coverLetterBody: d.coverLetterBody || initialBody,
        includeCoverLetter: includeCoverLetter,
        language: d.language, positions: d.positions, overLimit: d.overLimit,
        error: d.emailSource === "none" ? t("bulk.noEmail") : undefined,
        fullName: fullName,
        signatureChecked: isSigChecked,
      };
    } catch (e: any) {
      return { ...it, status: "failed", error: e.message };
    }
  }

  async function sendItem(it: Item): Promise<Item> {
    if (!it.to.trim()) return { ...it, status: "skipped", error: t("bulk.noEmail") };
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: it.to, subject: it.subject, body: it.body,
          company: it.company, country: it.country, positions: it.positions,
          emailSource: it.emailSource, draftSource: "template", language: it.language,
          includeCoverLetter: it.includeCoverLetter,
          coverLetterBody: it.includeCoverLetter ? it.coverLetterBody : undefined,
        }),
      });
      const d = await r.json();
      if (r.status === 402) return { ...it, status: "failed", error: t("new.limitReached") };
      if (!r.ok) throw new Error(d.error || "error");
      return { ...it, status: "sent", error: undefined };
    } catch (e: any) {
      return { ...it, status: "failed", error: e.message };
    }
  }

  async function run() {
    let currentItems = items;
    if (!items.length && raw.trim()) {
      const parsed = parseItems(raw);
      if (!parsed.length) return;
      const queued: Item[] = parsed.map((input, i) => ({
        id: i,
        input,
        status: "queued",
        to: "",
        subject: "",
        body: "",
        coverLetterBody: "",
        includeCoverLetter: includeCoverLetter,
      }));
      setItems(queued);
      currentItems = queued;
      setRaw("");
    }
    if (!currentItems.length) return;
    setRunning(true);
    stopRef.current = false;
    for (const base of currentItems) {
      if (base.status === "sent") continue;
      if (stopRef.current) {
        update(base.id, { status: "skipped", error: t("bulk.stopped") });
        continue;
      }
      let it = base;
      if (it.status === "queued" || it.status === "failed" || it.status === "analyzing") {
        update(it.id, { status: "analyzing" });
        it = await analyzeItem(it);
        setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
      }
      if (!stopRef.current && auto && it.status === "drafted" && !it.overLimit && it.to.trim()) {
        update(it.id, { status: "sending" });
        it = await sendItem(it);
        setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
      }
    }
    setRunning(false);
    stopRef.current = false;
  }

  function addToQueue() {
    const parsed = parseItems(raw);
    if (!parsed.length) return;
    setItems((prev) => {
      const maxId = prev.reduce((max, item) => (item.id > max ? item.id : max), -1);
      const newItems: Item[] = parsed.map((input, i) => ({
        id: maxId + 1 + i,
        input,
        status: "queued",
        to: "",
        subject: "",
        body: "",
        coverLetterBody: "",
        includeCoverLetter: includeCoverLetter,
      }));
      return [...prev, ...newItems];
    });
    setRaw("");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    try {
      const text = e.clipboardData?.getData("text");
      if (!text || !text.trim()) return;

      const parsed = parseItems(text);
      if (!parsed.length) return;

      setItems((prev) => {
        const maxId = prev.reduce((max, item) => (item.id > max ? item.id : max), -1);
        const newItems: Item[] = parsed.map((input, i) => ({
          id: maxId + 1 + i,
          input,
          status: "queued",
          to: "",
          subject: "",
          body: "",
          coverLetterBody: "",
          includeCoverLetter: includeCoverLetter,
        }));
        return [...prev, ...newItems];
      });

      // Clear the textarea after a brief delay so the user sees the paste succeed
      setTimeout(() => {
        setRaw("");
      }, 100);
    } catch (err) {
      console.error("Paste error:", err);
    }
  }

  function clearQueue() {
    setItems([]);
  }

  function stop() {
    stopRef.current = true;
  }

  async function sendOne(id: number) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    update(id, { status: "sending" });
    const res = await sendItem(it);
    setItems((prev) => prev.map((x) => (x.id === id ? res : x)));
  }

  async function sendAllDrafts() {
    const toSend = items.filter((it) => it.status === "drafted" && it.to.trim());
    if (!toSend.length) return;
    setRunning(true);
    stopRef.current = false;
    for (const base of toSend) {
      if (stopRef.current) {
        update(base.id, { status: "skipped", error: t("bulk.stopped") });
        continue;
      }
      update(base.id, { status: "sending" });
      const res = await sendItem(base);
      setItems((prev) => prev.map((x) => (x.id === base.id ? res : x)));
    }
    setRunning(false);
    stopRef.current = false;
  }

  function handleSignatureToggle(id: number, checked: boolean) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (!item.fullName) return { ...item, signatureChecked: checked };

        const sigText = `\n\nSincerely,\n${item.fullName}`;
        let newBody = item.body;
        if (checked) {
          if (!newBody.includes("Sincerely,")) {
            newBody = newBody.trim() + sigText;
          }
        } else {
          if (newBody.includes("Sincerely,")) {
            newBody = newBody.replace(sigText, "").replace(/\n\nSincerely,\n.*$/, "").trim();
          }
        }

        return { ...item, signatureChecked: checked, body: newBody };
      })
    );
    try { localStorage.setItem("paply:pref:includeSignature", String(checked)); } catch {}
  }

  const [rewritingItemId, setRewritingItemId] = useState<number | null>(null);

  async function rewriteCoverLetterForItem(id: number) {
    const it = items.find((x) => x.id === id);
    if (!it || !it.coverLetterBody?.trim() || rewritingItemId === id) return;
    setRewritingItemId(id);
    try {
      const r = await fetch("/api/rewrite-cover-letter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentCoverLetter: it.coverLetterBody,
          jobText: it.input,
          company: it.company || "",
          positions: it.positions || [],
          language: it.language || "en",
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.body) throw new Error(d.error || "rewrite failed");
      update(id, { coverLetterBody: d.body });
    } catch {
      // silently fail
    } finally {
      setRewritingItemId(null);
    }
  }


  const statusClass: Record<Status, string> = {
    queued: "", analyzing: "", drafted: "chip-accent", sending: "",
    sent: "chip-ok", failed: "chip-warn", skipped: "chip-warn",
  };
  const counts = {
    total: items.length,
    sent: items.filter((i) => i.status === "sent").length,
    done: items.filter((i) => ["sent", "failed", "skipped"].includes(i.status)).length,
  };

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <div className="row gap-3" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>{t("bulk.title")}</h1>
            <p className="text-secondary">{t("bulk.sub")}</p>
          </div>
          <Link href="/app/new" className="btn btn-sm btn-ghost">{t("bulk.single")} →</Link>
        </div>
      </header>

      <section className="glass card stack gap-4">
        <label className="field">
          <span className="field-label">{t("bulk.input")}</span>
          <textarea
            className="textarea"
            style={{ minHeight: 180 }}
            placeholder={t("bulk.placeholder")}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onPaste={handlePaste}
            disabled={running}
          />
          <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("bulk.hint")}</span>
        </label>

        <div className="row gap-6 wrap" style={{ alignItems: "center" }}>
          <div className="stack gap-2">
            <span className="field-label">{t("new.mode")}</span>
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={!auto} className={`seg${!auto ? " active" : ""}`} onClick={() => setAuto(false)} disabled={running}>{t("new.semi")}</button>
              <button role="tab" aria-selected={auto} className={`seg${auto ? " active" : ""}`} onClick={() => setAuto(true)} disabled={running}>{t("new.full")}</button>
            </div>
          </div>
          <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none", marginTop: "var(--space-4)" }}>
            <input
              type="checkbox"
              checked={includeCoverLetter}
              onChange={(e) => {
                setIncludeCoverLetter(e.target.checked);
                try { localStorage.setItem("paply:pref:includeCoverLetter", String(e.target.checked)); } catch {}
              }}
              style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: "var(--text-13)", color: "var(--text-secondary)" }}>
              {t("new.coverLetter")}
            </span>
          </label>
        </div>
        <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{auto ? t("bulk.autoNote") : t("bulk.semiNote")}</span>

        <div className="row gap-3 wrap" style={{ alignItems: "center" }}>
          <button className="btn btn-primary" data-loading={running} onClick={run} disabled={running}>
            {!running && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {running ? `${counts.done}/${counts.total}` : t("bulk.run")}
          </button>
          {!running && (
            <>
              <button className="btn" onClick={addToQueue} disabled={!raw.trim()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t("bulk.addToQueue")}
              </button>
              {items.length > 0 && (
                <button className="btn btn-ghost" onClick={clearQueue}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  {t("bulk.clearQueue")}
                </button>
              )}
            </>
          )}
          {running && (
            <button className="btn btn-danger btn-sm" onClick={stop}>{t("bulk.stop")}</button>
          )}
          {!running && items.length > 0 && (
            <span className="chip chip-ok" style={{ marginLeft: "auto" }}>{t("bulk.sentCount").replace("{n}", String(counts.sent))}</span>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <div className="stack gap-3">
          {items.map((it) => (
            <div key={it.id} className="glass card stack gap-2">
              <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                <b>{it.company || `#${it.id + 1}`}</b>
                {it.country && <span className="chip">{it.country}</span>}
                <span className={`chip ${statusClass[it.status]}`}>{t(`bulk.status.${it.status}`)}</span>
                {(it.status === "drafted" || it.status === "skipped") && (
                  <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => update(it.id, { expanded: !it.expanded })}>
                    {it.expanded ? t("bulk.collapse") : t("bulk.review")}
                  </button>
                )}
              </div>
              {!it.expanded && it.subject && <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{it.subject}</span>}
              {it.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{it.error}</span>}

              {it.expanded && (
                <div className="stack gap-3">
                  <label className="field">
                    <span className="field-label">{t("new.to")}</span>
                    <input className="input" value={it.to} onChange={(e) => update(it.id, { to: e.target.value })} placeholder="name@business.com" />
                  </label>
                  <label className="field">
                    <span className="field-label">{t("new.subject")}</span>
                    <input className="input" value={it.subject} onChange={(e) => update(it.id, { subject: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">{t("new.body")}</span>
                    <textarea className="textarea" style={{ minHeight: 160 }} value={it.body} onChange={(e) => update(it.id, { body: e.target.value })} />
                  </label>

                  {it.fullName && (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "-6px", marginBottom: "var(--space-1)" }}>
                      <input
                        id={`signature-checkbox-${it.id}`}
                        type="checkbox"
                        checked={it.signatureChecked || false}
                        onChange={(e) => handleSignatureToggle(it.id, e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                      <label htmlFor={`signature-checkbox-${it.id}`} style={{ fontSize: "var(--text-13)", cursor: "pointer", fontWeight: 500, userSelect: "none", color: "var(--text-secondary)" }}>
                        {t("new.addSignature")}
                      </label>
                    </div>
                  )}

                  <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={it.includeCoverLetter || false}
                      onChange={(e) => update(it.id, { includeCoverLetter: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                    />
                    <span style={{ fontSize: "var(--text-13)", color: "var(--text-secondary)" }}>
                      {t("new.coverLetter")}
                    </span>
                  </label>

                  {it.includeCoverLetter && (
                    <div className="stack gap-3 reveal" style={{ marginTop: "var(--space-1)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
                        <span className="field-label" style={{ margin: 0, fontSize: "var(--text-13)", display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          {t("new.coverLetterTitle")}
                        </span>
                        <div className="row gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: "var(--text-11)", minHeight: 24, padding: "0 var(--space-2)", gap: 4 }}
                            onClick={() => update(it.id, { showInlinePreview: !it.showInlinePreview })}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {it.showInlinePreview ? (
                                <>
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </>
                              ) : (
                                <>
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </>
                              )}
                            </svg>
                            {it.showInlinePreview ? t("new.hidePreview") : t("new.showPreview")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: "var(--text-11)", minHeight: 24, padding: "0 var(--space-2)", gap: 4 }}
                            onClick={() => setPreviewItemIndex(it.id)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            {t("new.preview")}
                          </button>
                        </div>
                      </div>
                      
                      {it.showInlinePreview && (
                        <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" }}>
                          <div className="stack gap-1">
                            <span className="field-label" style={{ fontSize: "var(--text-11)", opacity: 0.7 }}>{t("new.coverLetterBody")}</span>
                            <textarea
                              className="textarea"
                              style={{ minHeight: 200, fontSize: "var(--text-13)", height: "100%", resize: "vertical" }}
                              value={it.coverLetterBody || ""}
                              onChange={(e) => update(it.id, { coverLetterBody: e.target.value })}
                              placeholder={t("new.coverLetterBody")}
                            />
                          </div>

                          <div className="stack gap-1">
                            <span className="field-label" style={{ fontSize: "var(--text-11)", opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                              {t("new.preview")}
                            </span>
                            <div style={{ flex: 1, minHeight: 200, maxHeight: 300, overflowY: "auto", padding: "var(--space-3)", background: "rgba(255,255,255,0.95)", color: "var(--content-primary)", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid var(--glass-stroke)", fontFamily: "Georgia, serif", fontSize: "10px", lineHeight: "1.4", display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ fontSize: "11px", color: "var(--content-primary)" }}>Applicant</strong>
                              </div>

                              <div style={{ color: "var(--content-secondary)", fontSize: "8px" }}>
                                {(() => {
                                  const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
                                    en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                    tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
                                    es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
                                    fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
                                    de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
                                    it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
                                    pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
                                  };
                                  const lang = it.language || "en";
                                  const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                                  return loc.formatDate(new Date());
                                })()}
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ color: "var(--content-primary)" }}>{it.company || "Company"}</strong>
                                <span style={{ color: "var(--content-secondary)" }}>
                                  {(() => {
                                    const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
                                      en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                      tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
                                      es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
                                      fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
                                      de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
                                      it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
                                      pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
                                    };
                                    const lang = it.language || "en";
                                    const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                                    return loc.hiringTeam;
                                  })()}
                                </span>
                              </div>

                              <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "6px", color: "var(--content-primary)", textAlign: "justify" }}>
                                {(it.coverLetterBody || "").split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                                  <p key={i} style={{ margin: 0 }}>{p}</p>
                                ))}
                              </div>

                              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "1px" }}>
                                <span>
                                  {(() => {
                                    const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
                                      en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                      tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
                                      es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
                                      fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
                                      de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
                                      it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
                                      pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
                                    };
                                    const lang = it.language || "en";
                                    const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                                    return loc.sincerely;
                                  })()}
                                </span>
                                <strong style={{ color: "var(--content-primary)" }}>Applicant</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cover Letter Quality Check Widget */}
                      <div className="glass card stack gap-2" style={{ background: "rgba(255,255,255,0.01)", padding: "var(--space-2)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)" }}>
                        <span className="field-label" style={{ margin: 0, fontSize: "var(--text-12)", opacity: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          {t("new.coverLetterChecklist")}
                        </span>
                        
                        <div className="stack gap-1" style={{ marginTop: "var(--space-1)" }}>
                          {/* Rule 1: Includes company name */}
                          {(() => {
                            const hasCompany = (it.coverLetterBody || "").toLowerCase().includes((it.company || "").toLowerCase());
                            return (
                              <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                                {hasCompany ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-success, #10b981)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-warning, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                )}
                                <span className="text-secondary">{t("new.coverLetterCheck.company")}:</span>
                                <strong className="chip chip-sm" style={{ fontSize: "var(--text-10)", padding: "0px 4px" }}>{it.company || "—"}</strong>
                              </div>
                            );
                          })()}

                          {/* Rule 2: Includes target roles */}
                          {(() => {
                            const roles = it.positions || [];
                            const matchedRole = roles.find(r => (it.coverLetterBody || "").toLowerCase().includes(r.toLowerCase()));
                            const hasMatched = Boolean(matchedRole);
                            return (
                              <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                                {hasMatched ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-success, #10b981)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-warning, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                )}
                                <span className="text-secondary">{t("new.coverLetterCheck.roles")}:</span>
                                <div className="row gap-1">
                                  {roles.map(r => (
                                    <strong key={r} className={`chip chip-sm ${matchedRole === r ? "chip-accent" : ""}`} style={{ fontSize: "var(--text-10)", padding: "0px 4px" }}>
                                      {r}
                                    </strong>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Rule 3: Avoids email specific keywords */}
                          {(() => {
                            const hasEmailPhrases = /attached (to )?this email|email attachment|attachment in this mail|e-postada|ekli mail|bu mail|e-posta eki|dosya ektedir|ek e-posta/i.test(it.coverLetterBody || "");
                            return (
                              <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                                {!hasEmailPhrases ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-success, #10b981)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-warning, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                )}
                                <span className="text-secondary">{t("new.coverLetterCheck.noEmailPhrases")}</span>
                              </div>
                            );
                          })()}

                          {/* Rule 4: Custom tailored status */}
                          {(() => {
                            const roles = it.positions || [];
                            const hasMatched = roles.some(r => (it.coverLetterBody || "").toLowerCase().includes(r.toLowerCase()));
                            const hasCompany = (it.coverLetterBody || "").toLowerCase().includes((it.company || "").toLowerCase());
                            const isTailored = hasMatched && hasCompany;
                            return (
                              <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                                {isTailored ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-success, #10b981)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-warning, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                )}
                                <span className="text-secondary">{t("new.coverLetterCheck.customized")}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="row gap-3">
                    <button className="btn btn-primary btn-sm" data-loading={it.status === "sending"} onClick={() => sendOne(it.id)} disabled={it.status === "sending" || it.overLimit || !it.to.trim()}>
                      {t("new.send")}
                    </button>
                    {it.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
                  </div>
                </div>
              )}

              {!it.expanded && it.status === "drafted" && (
                <div className="row gap-3">
                  <button className="btn btn-primary btn-sm" data-loading={false} onClick={() => sendOne(it.id)} disabled={it.overLimit || !it.to.trim()}>
                    {t("new.send")}
                  </button>
                  {it.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
                </div>
              )}
            </div>
          ))}

          {items.some((it) => it.status === "drafted" && it.to.trim()) && (
            <div className="row gap-3" style={{ justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
              <button
                className="btn btn-primary"
                data-loading={running}
                onClick={sendAllDrafts}
                disabled={running}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {t("bulk.sendAll")}
              </button>
            </div>
          )}
        </div>
      )}
      
    </div>
  );
}
