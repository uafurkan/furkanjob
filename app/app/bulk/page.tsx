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
      return {
        ...it,
        status: d.emailSource === "none" ? "skipped" : "drafted",
        company: d.company, country: d.country, emailSource: d.emailSource,
        to: (d.emails || []).join(", "), subject: d.subject, body: d.body,
        coverLetterBody: d.coverLetterBody || d.body,
        includeCoverLetter: includeCoverLetter,
        language: d.language, positions: d.positions, overLimit: d.overLimit,
        error: d.emailSource === "none" ? t("bulk.noEmail") : undefined,
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
            {running ? `${counts.done}/${counts.total}` : t("bulk.run")}
          </button>
          {!running && (
            <>
              <button className="btn" onClick={addToQueue} disabled={!raw.trim()}>
                ➕ {t("bulk.addToQueue")}
              </button>
              {items.length > 0 && (
                <button className="btn btn-ghost" onClick={clearQueue}>
                  🗑️ {t("bulk.clearQueue")}
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
                        <span className="field-label" style={{ margin: 0, fontSize: "var(--text-13)" }}>📝 {t("new.coverLetterTitle")}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: "var(--text-11)", minHeight: 24, padding: "0 var(--space-2)" }}
                          onClick={() => setPreviewItemIndex(it.id)}
                        >
                          📄 {t("new.preview")}
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" }}>
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
                          <span className="field-label" style={{ fontSize: "var(--text-11)", opacity: 0.7 }}>📄 {t("new.preview")}</span>
                          <div style={{ flex: 1, minHeight: 200, maxHeight: 300, overflowY: "auto", padding: "var(--space-3)", background: "#ffffff", color: "#1e293b", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", fontFamily: "Georgia, serif", fontSize: "10px", lineHeight: "1.4", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <strong style={{ fontSize: "11px", color: "#0f172a" }}>Applicant</strong>
                            </div>

                            <div style={{ color: "#64748b", fontSize: "8px" }}>
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
                              <strong style={{ color: "#0f172a" }}>{it.company || "Company"}</strong>
                              <span style={{ color: "#475569" }}>
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

                            <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "6px", color: "#334155", textAlign: "justify" }}>
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
                              <strong style={{ color: "#0f172a" }}>Applicant</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cover Letter Quality Check Widget */}
                      <div className="glass card stack gap-2" style={{ background: "rgba(255,255,255,0.01)", padding: "var(--space-2)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)" }}>
                        <span className="field-label" style={{ margin: 0, fontSize: "var(--text-12)", opacity: 0.8 }}>
                          🔍 {t("new.coverLetterChecklist")}
                        </span>
                        
                        <div className="stack gap-1" style={{ marginTop: "var(--space-1)" }}>
                          {/* Rule 1: Includes company name */}
                          <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                            <span style={{ color: (it.coverLetterBody || "").toLowerCase().includes((it.company || "").toLowerCase()) ? "var(--signal-success, #10b981)" : "var(--signal-warning, #f59e0b)" }}>
                              {(it.coverLetterBody || "").toLowerCase().includes((it.company || "").toLowerCase()) ? "✓" : "⚠"}
                            </span>
                            <span className="text-secondary">{t("new.coverLetterCheck.company")}:</span>
                            <strong className="chip chip-sm" style={{ fontSize: "var(--text-10)", padding: "0px 4px" }}>{it.company || "—"}</strong>
                          </div>

                          {/* Rule 2: Includes target roles */}
                          {(() => {
                            const roles = it.positions || [];
                            const matchedRole = roles.find(r => (it.coverLetterBody || "").toLowerCase().includes(r.toLowerCase()));
                            const hasMatched = Boolean(matchedRole);
                            return (
                              <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-12)" }}>
                                <span style={{ color: hasMatched ? "var(--signal-success, #10b981)" : "var(--signal-warning, #f59e0b)" }}>
                                  {hasMatched ? "✓" : "⚠"}
                                </span>
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
                                <span style={{ color: !hasEmailPhrases ? "var(--signal-success, #10b981)" : "var(--signal-warning, #f59e0b)" }}>
                                  {!hasEmailPhrases ? "✓" : "⚠"}
                                </span>
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
                                <span style={{ color: isTailored ? "var(--signal-success, #10b981)" : "var(--signal-warning, #f59e0b)" }}>
                                  {isTailored ? "✓" : "⚠"}
                                </span>
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
        </div>
      )}
      {previewItemIndex !== null && (
        <div className="confirm-overlay" onClick={() => setPreviewItemIndex(null)}>
          <div className="confirm-modal cl-preview-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: "94%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", padding: "var(--space-4)" }}>
            <div className="detail-header" style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "var(--space-3)", marginBottom: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="detail-company" style={{ fontSize: "var(--text-16)", fontWeight: 600 }}>📄 {t("new.coverLetterTitle")} ({t("new.preview")})</span>
              <button className="btn btn-sm" onClick={() => setPreviewItemIndex(null)}>{t("apps.detail.close")}</button>
            </div>
            
            {/* Styled "A4" Document Preview Box */}
            {(() => {
              const item = items.find(x => x.id === previewItemIndex);
              if (!item) return null;
              
              const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
                en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
                es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
                fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
                de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
                it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
                pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
              };
              const lang = item.language || "en";
              const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
              const dateStr = loc.formatDate(new Date());
              
              return (
                <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4) var(--space-5)", background: "#ffffff", color: "#1e293b", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", fontFamily: "Georgia, serif", fontSize: "14px", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: "16px" }}>
                  
                  {/* Sender Details */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "16px", color: "#0f172a" }}>Applicant</strong>
                  </div>
                  
                  {/* Date */}
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    {dateStr}
                  </div>
                  
                  {/* Company Info */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                    <strong style={{ color: "#0f172a" }}>{item.company}</strong>
                    <span style={{ color: "#475569" }}>{loc.hiringTeam}</span>
                  </div>
                  
                  {/* Document Body Paragraphs */}
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px", color: "#334155", textAlign: "justify" }}>
                    {(item.coverLetterBody || "").split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                      <p key={i} style={{ margin: 0 }}>{p}</p>
                    ))}
                  </div>
                  
                  {/* Closing */}
                  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>{loc.sincerely}</span>
                    <strong style={{ color: "#0f172a" }}>Applicant</strong>
                  </div>
                  
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
