"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/components/i18n";
import { APP_LANGS } from "@/lib/engine/template";
import { checkRecipients, applyFix } from "@/lib/email-check";

type Eligibility = { status: "ok" | "warning" | "blocked"; note: string };
type GenResult = {
  company: string;
  country: string;
  positions: string[];
  applyFor?: string[];
  droppedRoles?: string[];
  fitScore?: number;
  fitSummary?: string;
  eligibility?: Eligibility;
  emails: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "none";
  checkedOrigins?: string[];
  subject: string;
  subjectB?: string | null;
  body: string;
  draftSource: "ai" | "template";
  language: string;
  countryCode: string;
  visaCovered: boolean;
  visaLabel: string | null;
  fetchedUrl?: boolean;
  duplicate?: { id: string; company: string | null; when: string } | null;
  cv: { filename: string } | null;
  overLimit: boolean;
  plan: string;
  limit: number | null;
  used: number;
};

type SavedDraft = {
  text: string;
  language: string;
  auto: boolean;
  to: string;
  subject: string;
  body: string;
  res: GenResult;
  savedAt: number;
};

const DRAFT_KEY = "paply:draft:v1";

function saveDraft(draft: SavedDraft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}
function loadDraft(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedDraft) : null;
  } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function NewApplication() {
  const { t } = useT();
  const { data: session } = useSession();
  // Only a real Google OAuth session can send. Demo/credentials = drafts only.
  // The server enforces this too (app/api/send/route.ts); this just disables the UI.
  const canSend = ((session?.user as any)?.provider) === "google";
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [res, setRes] = useState<GenResult | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [ccSelf, setCcSelf] = useState(false);
  const [docs, setDocs] = useState<{ id: string; type: string; filename: string }[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [cvs, setCvs] = useState<{ id: string; filename: string; isDefault: boolean }[]>([]);
  const [selectedCv, setSelectedCv] = useState<string>("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [confirmPending, setConfirmPending] = useState<{ to: string; subject: string; body: string; meta: GenResult } | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [bodyBeforeRefine, setBodyBeforeRefine] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on mount (not if restoring a draft)
  useEffect(() => {
    if (!loadDraft()) textareaRef.current?.focus();
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+Enter → analyze (or send if result ready)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!analyzing && !sending) {
          if (res && to.trim()) doSend({ to, subject, body, meta: res });
          else analyze();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // While the confirm modal is open: Enter sends, Escape cancels (no mouse needed).
  useEffect(() => {
    if (!confirmPending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); setConfirmPending(null); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const p = confirmPending!;
        setConfirmPending(null);
        doSend(p, true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmPending]);

  // Load the user's document library + CVs (for the attachment pickers).
  useEffect(() => {
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.documents) setDocs(d.documents); })
      .catch(() => {});
    fetch("/api/cv")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.cvs) {
          setCvs(d.cvs);
          const def = d.cvs.find((c: any) => c.isDefault) || d.cvs[0];
          if (def) setSelectedCv(def.id);
        }
      })
      .catch(() => {});
  }, []);

  // Restore draft on mount
  useEffect(() => {
    const d = loadDraft();
    if (!d) return;
    setText(d.text);
    setLanguage(d.language);
    setAuto(d.auto);
    setRes(d.res);
    setTo(d.to);
    setSubject(d.subject);
    setBody(d.body);
    setDraftRestoredAt(d.savedAt);
  }, []);

  // Auto-save draft whenever editable fields change (debounced 800ms)
  useEffect(() => {
    if (!res) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({ text, language, auto, to, subject, body, res, savedAt: Date.now() });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [text, language, auto, to, subject, body, res]);

  function discardDraft() {
    clearDraft();
    setText("");
    setLanguage("auto");
    setAuto(false);
    setRes(null);
    setTo("");
    setSubject("");
    setBody("");
    setMsg(null);
    setDraftRestoredAt(null);
  }

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setText(clip);
        textareaRef.current?.focus();
      }
    } catch {
      // Clipboard blocked (permission/Safari) — fall back to manual paste, focus the field.
      textareaRef.current?.focus();
    }
  }

  const srcLabel = (s: string) =>
    ({ text: t("new.src.text"), "page-scrape": t("new.src.scrape"), "web-search": t("new.src.web"), none: t("new.src.none") } as Record<string, string>)[s] || s;
  const langLabel = (c: string) => APP_LANGS.find((l) => l.code === c)?.label || c;

  async function analyze() {
    if (!text.trim()) return setMsg({ kind: "warn", text: t("new.pasteFirst") });
    setAnalyzing(true);
    setStage(t("new.stage.analyzing"));
    setMsg(null);
    setRes(null);
    const stageTimer1 = setTimeout(() => setStage(t("new.stage.searching")), 1400);
    const stageTimer = setTimeout(() => setStage(t("new.stage.drafting")), 3800);
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
      setDraftRestoredAt(null);
      if (d.emailSource === "none") {
        setMsg({ kind: "warn", text: t("new.noEmailFound") });
        return;
      }
      // Full-auto sends only when there's no hard eligibility block — otherwise stop and let the
      // user read the warning and decide (semi-auto), even in full-auto mode.
      if (d.eligibility?.status === "blocked") {
        setMsg({ kind: "warn", text: t("new.fit.blockedAuto") });
      } else if (auto && canSend && !d.overLimit && d.emails.length) {
        await doSend({ to: toVal, subject: d.subject, body: d.body, meta: d }, true);
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer);
      setAnalyzing(false);
      setStage(null);
    }
  }

  async function doSend(p: { to: string; subject: string; body: string; meta: GenResult }, skipConfirm = false) {
    if (!p.to.trim()) return setMsg({ kind: "err", text: t("new.enterRecipient") });
    if (!canSend) return setMsg({ kind: "warn", text: t("new.demoNoSend") });
    if (!skipConfirm) { setConfirmPending(p); return; }
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: p.to, subject: p.subject, body: p.body,
          company: p.meta.company, country: p.meta.country,
          positions: p.meta.applyFor?.length ? p.meta.applyFor : p.meta.positions,
          emailSource: p.meta.emailSource, draftSource: p.meta.draftSource,
          language: p.meta.language,
          includeCoverLetter,
          ccSelf,
          documentIds: selectedDocs,
          cvId: selectedCv || undefined,
        }),
      });
      const d = await r.json();
      if (r.status === 402) return setMsg({ kind: "warn", text: t("new.limitReached") });
      if (r.status === 403 && d?.demo) return setMsg({ kind: "warn", text: t("new.demoNoSend") });
      if (!r.ok) throw new Error(d.error || "Error");
      clearDraft();
      setDraftRestoredAt(null);
      const attachLabel = d.coverLetterAttached ? t("new.coverLetterAttached") : d.cvAttached ? t("new.cvAttached") : t("new.cvNone");
      setMsg({ kind: "ok", text: `${d.sentTo.join(", ")} ${attachLabel}` });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  // Recipient sanity check — surface typos/invalid before send (not while empty).
  const recipientIssue = to.trim() ? checkRecipients(to) : null;

  async function refine(action: "shorter" | "warmer" | "formal" | "regenerate") {
    if (!res || !body.trim() || refining) return;
    const prev = body;
    setRefining(action);
    setMsg(null);
    try {
      const r = await fetch("/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, action, company: res.company, language: res.language }),
      });
      const d = await r.json();
      if (!r.ok || !d.body) throw new Error(d.error || "refine failed");
      setBodyBeforeRefine(prev);
      setBody(d.body);
    } catch {
      setMsg({ kind: "warn", text: t("new.refine.failed") });
    } finally {
      setRefining(null);
    }
  }

  const restoredLabel = draftRestoredAt
    ? t("new.draftRestored").replace("{time}", new Date(draftRestoredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    : null;

  return (
    <div className="page-new stack gap-6">
      <header className="page-head">
        <div className="row gap-3" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>{t("new.title")}</h1>
            <p className="text-secondary">{t("new.sub")}</p>
            <Link href="/app/bulk" className="text-secondary" style={{ fontSize: "var(--text-13)", textDecoration: "none" }}>⚡ {t("new.bulk")} →</Link>
          </div>
          {res && (
            <button className="btn btn-ghost btn-sm draft-discard" onClick={discardDraft} title={t("new.discard")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              {t("new.discard")}
            </button>
          )}
        </div>
        {restoredLabel && (
          <p className="draft-restored-notice">{restoredLabel}</p>
        )}
      </header>

      <section className="glass card stack gap-4">
        <label className="field">
          <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
            <span className="field-label" style={{ margin: 0 }}>{t("new.content")}</span>
            {!text.trim() && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={pasteFromClipboard}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                </svg>
                {t("new.paste")}
              </button>
            )}
          </div>
          <textarea ref={textareaRef} className="textarea" placeholder={t("new.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("new.urlHint")}</span>
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
            {analyzing ? (stage || t("new.analyzing")) : sending ? t("new.sending") : auto ? t("new.analyzeSend") : t("new.analyze")}
          </button>
          <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>⌘↵</span>
          {res && <span className="chip">{res.draftSource === "ai" ? t("new.aiLabel") : t("new.tmpl")}</span>}
          {res && <span className="chip">{langLabel(res.language)}</span>}
        </div>
      </section>

      {res && (
        <section className="glass card stack gap-4 reveal">
          <div className="row gap-2 wrap">
            <span className="chip chip-accent">{res.company}</span>
            {res.country && <span className="chip">{res.country}</span>}
            {(res.applyFor && res.applyFor.length ? res.applyFor : res.positions).map((p) => (
              <span key={p} className="chip">{p}</span>
            ))}
            <span className={`chip ${res.emailSource === "none" ? "chip-warn" : "chip-ok"}`}>{t("new.mail")}: {srcLabel(res.emailSource)}</span>
          </div>

          {(res.fitSummary || (res.eligibility && res.eligibility.status !== "ok") || (res.droppedRoles && res.droppedRoles.length > 0)) && (
            <div className={`fit-panel reveal fit-${res.eligibility?.status === "blocked" ? "blocked" : res.eligibility?.status === "warning" ? "warning" : "ok"}`}>
              {typeof res.fitScore === "number" && res.fitScore > 0 && (
                <div className="fit-head">
                  <span className="fit-score" aria-label={t("new.fit.score")}>{res.fitScore}<span className="fit-score-max">/100</span></span>
                  <span className="fit-score-label">{t("new.fit.score")}</span>
                </div>
              )}
              {res.fitSummary && <p className="fit-summary">{res.fitSummary}</p>}
              {res.droppedRoles && res.droppedRoles.length > 0 && (
                <p className="fit-dropped">{t("new.fit.dropped").replace("{roles}", res.droppedRoles.join(", "))}</p>
              )}
              {res.eligibility && res.eligibility.status !== "ok" && res.eligibility.note && (
                <p className={`fit-eligibility fit-eligibility-${res.eligibility.status}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{res.eligibility.note}</span>
                </p>
              )}
            </div>
          )}

          {res.duplicate && (
            <div className="dup-banner reveal">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                {t("new.duplicate").replace("{when}", new Date(res.duplicate.when).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }))}
              </span>
              <Link href="/app/profile#applications" className="btn btn-sm" style={{ marginLeft: "auto", fontSize: "var(--text-12)" }}>
                {t("new.duplicateView")}
              </Link>
            </div>
          )}

          {res.visaCovered && (
            <div className="visa-banner reveal">
              <span className="visa-banner-ico" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span>
                {t("new.visaCovered")
                  .replace("{visa}", res.visaLabel || t("new.visaGeneric"))
                  .replace("{country}", res.country)}
              </span>
            </div>
          )}

          <label className="field">
            <span className="field-label">{t("new.to")}</span>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@business.com" />
            {recipientIssue?.kind === "typo" && (
              <span className="email-check-warn" style={{ marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {t("new.emailTypo").replace("{suggestion}", recipientIssue.suggestion)}
                <button
                  type="button"
                  className="email-check-fix"
                  onClick={() => setTo((cur) => applyFix(cur, recipientIssue.value, recipientIssue.suggestion))}
                >
                  {t("new.emailTypoFix")}
                </button>
              </span>
            )}
            {recipientIssue?.kind === "invalid" && (
              <span className="email-check-warn" style={{ marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {t("new.emailInvalid").replace("{value}", recipientIssue.value)}
              </span>
            )}
            {res.emailSource === "none" && (
              <div className="recover-panel reveal">
                <span className="recover-title">{t("new.recover.title")}</span>
                <div className="recover-links">
                  {(res.checkedOrigins || []).slice(0, 3).map((o) => {
                    let host = o;
                    try { host = new URL(o).hostname.replace(/^www\./, ""); } catch {}
                    return (
                      <span key={o} className="recover-site">
                        <span className="recover-host">{host}</span>
                        <a className="recover-link" href={o} target="_blank" rel="noopener noreferrer">{t("new.recover.site")}</a>
                        <a className="recover-link" href={`${o}/contact`} target="_blank" rel="noopener noreferrer">{t("new.recover.contact")}</a>
                        <a className="recover-link" href={`${o}/careers`} target="_blank" rel="noopener noreferrer">{t("new.recover.careers")}</a>
                      </span>
                    );
                  })}
                  <a
                    className="recover-link recover-search"
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${res.company} ${res.country} contact email`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🔍 {t("new.recover.search")}
                  </a>
                </div>
              </div>
            )}
          </label>
          <div className="field">
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
              <span className="field-label" style={{ margin: 0 }}>{t("new.subject")}</span>
              {res?.subjectB && (
                <div className="ab-toggle">
                  <button
                    type="button"
                    className={`ab-btn${subject === res.subject ? " ab-active" : ""}`}
                    onClick={() => setSubject(res.subject)}
                  >A</button>
                  <button
                    type="button"
                    className={`ab-btn${subject === res.subjectB ? " ab-active" : ""}`}
                    onClick={() => setSubject(res.subjectB!)}
                  >B</button>
                </div>
              )}
              <span
                className="text-secondary"
                style={{
                  fontSize: "var(--text-12)", marginLeft: "auto",
                  color: subject.length > 60 ? "var(--signal-warning)" : undefined,
                }}
              >
                {subject.length}
              </span>
            </div>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            {res?.subjectB && subject !== res.subject && subject !== res.subjectB && (
              <span className="text-secondary" style={{ fontSize: "var(--text-12)", marginTop: 4 }}>{t("new.subjectCustom")}</span>
            )}
          </div>
          <div className="field">
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
              <span className="field-label" style={{ margin: 0 }}>{t("new.body")}</span>
              <span className="text-secondary" style={{ fontSize: "var(--text-12)", marginLeft: "auto" }}>
                {body.trim() ? body.trim().split(/\s+/).length : 0} {t("new.words")}
              </span>
            </div>
            <textarea className="textarea" style={{ minHeight: 260 }} value={body} onChange={(e) => setBody(e.target.value)} />
            {res.draftSource === "ai" && (
              <div className="refine-row" aria-busy={Boolean(refining)}>
                <span className="refine-label">{t("new.refine")}</span>
                {(["shorter", "warmer", "formal", "regenerate"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="refine-chip"
                    onClick={() => refine(a)}
                    disabled={Boolean(refining)}
                  >
                    {refining === a ? t("new.refine.working") : t(`new.refine.${a}`)}
                  </button>
                ))}
                {bodyBeforeRefine !== null && !refining && (
                  <button
                    type="button"
                    className="refine-chip refine-undo"
                    onClick={() => { setBody(bodyBeforeRefine); setBodyBeforeRefine(null); }}
                  >
                    ↩ {t("new.refine.undo")}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="stack gap-3">
            {cvs.length > 1 && (
              <label className="field" style={{ maxWidth: 320 }}>
                <span className="field-label">{t("new.cvSelect")}</span>
                <select className="input" value={selectedCv} onChange={(e) => setSelectedCv(e.target.value)}>
                  {cvs.map((c) => (
                    <option key={c.id} value={c.id}>{c.filename}{c.isDefault ? ` (${t("pf.cvDefault")})` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="row gap-3 wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>
                {cvs.length > 1
                  ? <>{t("new.attachment")}: <b>{cvs.find((c) => c.id === selectedCv)?.filename || res.cv?.filename}</b></>
                  : res.cv ? <>{t("new.attachment")}: <b>{res.cv.filename}</b></> : <span className="chip-warn">{t("new.noCv")}</span>}
              </span>
              <div className="row gap-3">
                {res.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
                {!canSend && <Link href="/app/profile" className="btn btn-sm">{t("new.connectGoogle")}</Link>}
                <button className="btn btn-primary" data-loading={sending} onClick={() => res && doSend({ to, subject, body, meta: res })} disabled={sending || res.overLimit || !canSend}>
                  {sending ? t("new.sending") : t("new.send")}
                </button>
              </div>
            </div>
            {!canSend && (
              <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("new.demoNoSend")}</span>
            )}
            <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: "var(--text-13)", color: "var(--text-secondary)" }}>
                {t("new.coverLetter")}
              </span>
            </label>

            <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={ccSelf}
                onChange={(e) => setCcSelf(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: "var(--text-13)", color: "var(--text-secondary)" }}>
                {t("new.ccSelf")}
              </span>
            </label>

            {docs.length > 0 && (
              <div className="stack gap-2">
                <span className="field-label">{t("new.extraDocs")}</span>
                {docs.map((d) => {
                  const checked = selectedDocs.includes(d.id);
                  return (
                    <label key={d.id} className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedDocs((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))
                        }
                        style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                      />
                      <span className="doc-type-chip">{t(`doc.type.${d.type}`)}</span>
                      <span style={{ fontSize: "var(--text-13)", color: "var(--content-secondary)" }}>{d.filename}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {msg && (
        <div className={`notice notice-${msg.kind} reveal`} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span>{msg.text}</span>
          {msg.kind === "ok" && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => { discardDraft(); textareaRef.current?.focus(); }}
            >
              {t("new.another")} →
            </button>
          )}
        </div>
      )}

      {confirmPending && (
        <div className="confirm-overlay" onClick={() => setConfirmPending(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-body">
              <p className="confirm-title">{t("new.send")}?</p>
              <p className="confirm-to">{confirmPending.to}</p>
              {confirmPending.meta.cv && (
                <p className="confirm-cv">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  {confirmPending.meta.cv.filename}
                </p>
              )}
              {includeCoverLetter && (
                <p className="confirm-cv" style={{ opacity: 0.75 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  cover_letter.docx
                </p>
              )}
              {docs.filter((d) => selectedDocs.includes(d.id)).map((d) => (
                <p key={d.id} className="confirm-cv" style={{ opacity: 0.75 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {d.filename}
                </p>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setConfirmPending(null)}>{t("new.cancel")}</button>
              <button className="btn btn-primary" onClick={() => { const p = confirmPending; setConfirmPending(null); doSend(p, true); }}>
                {t("new.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
