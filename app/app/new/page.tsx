"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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
  drafts?: { subject: string; body: string; style: string }[];
  coverLetterBody?: string | null;
  fullName?: string;
  contactEmail?: string;
  includeSignature?: boolean;
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
  coverLetterBody?: string;
  res: GenResult;
  savedAt: number;
  selectedDraftIndex?: number;
  currentDrafts?: { subject: string; body: string; style: string }[];
  signatureChecked?: boolean;
  fullName?: string;
  contactEmail?: string;
};

const DRAFT_KEY = "paply:draft:v1";

const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
  en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
  tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
  es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
  fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
  de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
  it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
  pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
};

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
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(0);
  const [currentDrafts, setCurrentDrafts] = useState<{ subject: string; body: string; style: string }[]>([]);
  const [signatureChecked, setSignatureChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [coverLetterPreviewOpen, setCoverLetterPreviewOpen] = useState(false);
  const [rewritingCoverLetter, setRewritingCoverLetter] = useState(false);

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
  }, [res, to, subject, body, analyzing, sending]);

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
    setCoverLetterBody(d.coverLetterBody || "");
    setDraftRestoredAt(d.savedAt);
    setSelectedDraftIndex(d.selectedDraftIndex || 0);
    setCurrentDrafts(d.currentDrafts || []);
    setSignatureChecked(d.signatureChecked || false);
    setFullName(d.fullName || "");
    setContactEmail(d.contactEmail || "");
  }, []);

  // Auto-save draft whenever editable fields change (debounced 800ms)
  useEffect(() => {
    if (!res) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({
        text, language, auto, to, subject, body, coverLetterBody, res, savedAt: Date.now(),
        selectedDraftIndex, currentDrafts, signatureChecked, fullName, contactEmail
      });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [text, language, auto, to, subject, body, coverLetterBody, res, selectedDraftIndex, currentDrafts, signatureChecked, fullName, contactEmail]);

  function discardDraft() {
    clearDraft();
    setText("");
    setLanguage("auto");
    setAuto(false);
    setRes(null);
    setTo("");
    setSubject("");
    setBody("");
    setCoverLetterBody("");
    setMsg(null);
    setDraftRestoredAt(null);
    if (redirectTimer.current) {
      clearInterval(redirectTimer.current);
      redirectTimer.current = null;
    }
    setRedirectCountdown(null);
    setSelectedDraftIndex(0);
    setCurrentDrafts([]);
    setFullName("");
    setContactEmail("");

    // Restore signature checkbox preference
    let lastSigPref = false;
    try {
      const sigPref = localStorage.getItem("paply:pref:includeSignature");
      if (sigPref !== null) lastSigPref = sigPref === "true";
    } catch {}
    setSignatureChecked(lastSigPref);
  }

  // Load settings preferences on mount
  useEffect(() => {
    try {
      const coverPref = localStorage.getItem("paply:pref:includeCoverLetter");
      if (coverPref !== null) {
        setIncludeCoverLetter(coverPref === "true");
      }
      const sigPref = localStorage.getItem("paply:pref:includeSignature");
      if (sigPref !== null) {
        setSignatureChecked(sigPref === "true");
      }
    } catch {}
  }, []);

  // Clean up redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearInterval(redirectTimer.current);
    };
  }, []);

  // Cancel redirect if user starts editing the content textarea
  useEffect(() => {
    if (redirectCountdown !== null) {
      const cancelRedirect = () => {
        if (redirectTimer.current) {
          clearInterval(redirectTimer.current);
          redirectTimer.current = null;
        }
        setRedirectCountdown(null);
      };
      textareaRef.current?.addEventListener("input", cancelRedirect);
      return () => textareaRef.current?.removeEventListener("input", cancelRedirect);
    }
  }, [redirectCountdown]);

  const handleDraftSelect = (index: number) => {
    setSelectedDraftIndex(index);
    const targetDraft = currentDrafts[index];
    if (!targetDraft) return;

    const loc = COVER_LETTER_L10N[res?.language || "en"] || COVER_LETTER_L10N.en;
    let targetBody = targetDraft.body;
    if (signatureChecked && fullName && !targetBody.includes(loc.sincerely)) {
      targetBody = targetBody.trim() + `\n\n${loc.sincerely}\n${fullName}`;
    } else if (!signatureChecked && targetBody.includes(loc.sincerely)) {
      targetBody = targetBody.replace(`\n\n${loc.sincerely}\n${fullName}`, "").replace(/\n\n[^\n]+\n[^\n]+$/, "").trim();
    }
    
    setSubject(targetDraft.subject);
    setBody(targetBody);
  };

  const handleCoverLetterToggle = (checked: boolean) => {
    setIncludeCoverLetter(checked);
    try { localStorage.setItem("paply:pref:includeCoverLetter", String(checked)); } catch {}
  };

  const handleSignatureToggle = (checked: boolean) => {
    setSignatureChecked(checked);
    try { localStorage.setItem("paply:pref:includeSignature", String(checked)); } catch {}
    if (!fullName) return;

    const loc = COVER_LETTER_L10N[res?.language || "en"] || COVER_LETTER_L10N.en;
    const sigText = `\n\n${loc.sincerely}\n${fullName}`;
    if (checked) {
      if (!body.includes(loc.sincerely)) {
        setBody((prev) => prev.trim() + sigText);
        setCurrentDrafts((prev) =>
          prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: d.body.trim() + sigText } : d))
        );
      }
    } else {
      if (body.includes(loc.sincerely)) {
        const cleanBody = body.replace(sigText, "").replace(/\n\n[^\n]+\n[^\n]+$/, "").trim();
        setBody(cleanBody);
        setCurrentDrafts((prev) =>
          prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: cleanBody } : d))
        );
      }
    }
  };

  const handleSubjectChange = (val: string) => {
    setSubject(val);
    setCurrentDrafts((prev) =>
      prev.map((d, i) => (i === selectedDraftIndex ? { ...d, subject: val } : d))
    );
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    setCurrentDrafts((prev) =>
      prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: val } : d))
    );
  };

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
      
      const parsedDrafts = d.drafts || [{ subject: d.subject, body: d.body, style: "Balanced & Personal" }];
      setCurrentDrafts(parsedDrafts);
      setSelectedDraftIndex(0);
      setFullName(d.fullName || "");
      setContactEmail(d.contactEmail || "");
      
      let initialBody = parsedDrafts[0].body;
      let isSigChecked = d.includeSignature || false;
      try {
        const sigPref = localStorage.getItem("paply:pref:includeSignature");
        if (sigPref !== null) {
          isSigChecked = sigPref === "true";
        }
      } catch {}

      if (isSigChecked && d.fullName) {
        const loc = COVER_LETTER_L10N[d.language || "en"] || COVER_LETTER_L10N.en;
        initialBody = initialBody.trim() + `\n\n${loc.sincerely}\n${d.fullName}`;
        setSignatureChecked(true);
      } else {
        setSignatureChecked(false);
      }
      setSubject(parsedDrafts[0].subject);
      setBody(initialBody);
      setCoverLetterBody(d.coverLetterBody || initialBody);
      setDraftRestoredAt(null);
      if (d.emailSource === "none") {
        setMsg({ kind: "warn", text: t("new.noEmailFound") });
        return;
      }
      // Full-auto sends only when there's no hard eligibility block — otherwise stop and let the
      // user read the warning and decide (semi-auto), even in full-auto mode.
      if (d.eligibility?.status === "blocked") {
        setMsg({ kind: "warn", text: t("new.fit.blockedAuto") });
      } else if (auto && !d.overLimit && d.emails.length) {
        await doSend({ to: toVal, subject: parsedDrafts[0].subject, body: initialBody, meta: d }, true);
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

  async function regenerateWithDeepThinking() {
    if (!text.trim() || analyzing || sending) return;
    setAnalyzing(true);
    setStage(t("new.stage.drafting") + " (Deep Thinking Mode)...");
    setMsg(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language, reasoningEffort: "high" }),
      });
      const d: GenResult = await r.json();
      if (!r.ok) throw new Error((d as any).error || "Error");
      setRes(d);
      
      const parsedDrafts = d.drafts || [{ subject: d.subject, body: d.body, style: "Balanced & Personal" }];
      setCurrentDrafts(parsedDrafts);
      setSelectedDraftIndex(0);
      setFullName(d.fullName || "");
      setContactEmail(d.contactEmail || "");
      
      let initialBody = parsedDrafts[0].body;
      let isSigChecked = signatureChecked;
      try {
        const sigPref = localStorage.getItem("paply:pref:includeSignature");
        if (sigPref !== null) {
          isSigChecked = sigPref === "true";
        }
      } catch {}

      if (isSigChecked && d.fullName) {
        const loc = COVER_LETTER_L10N[d.language || "en"] || COVER_LETTER_L10N.en;
        initialBody = initialBody.trim() + `\n\n${loc.sincerely}\n${d.fullName}`;
        setSignatureChecked(true);
      } else {
        setSignatureChecked(false);
      }
      setSubject(parsedDrafts[0].subject);
      setBody(initialBody);
      setCoverLetterBody(d.coverLetterBody || initialBody);
      setDraftRestoredAt(null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setAnalyzing(false);
      setStage(null);
    }
  }

  async function doSend(p: { to: string; subject: string; body: string; meta: GenResult }, skipConfirm = false) {
    if (!p.to.trim()) return setMsg({ kind: "err", text: t("new.enterRecipient") });

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
          coverLetterBody: includeCoverLetter ? coverLetterBody : undefined,
          ccSelf,
          documentIds: selectedDocs,
          cvId: selectedCv || undefined,
        }),
      });
      const d = await r.json();
      if (r.status === 402) return setMsg({ kind: "warn", text: t("new.limitReached") });

      if (!r.ok) throw new Error(d.error || "Error");
      clearDraft();
      setDraftRestoredAt(null);
      const attachLabel = d.coverLetterAttached ? t("new.coverLetterAttached") : d.cvAttached ? t("new.cvAttached") : t("new.cvNone");
      setMsg({ kind: "ok", text: `${d.sentTo.join(", ")} ${attachLabel}` });

      // Start 10 seconds redirect countdown to reset the page for a new application
      if (redirectTimer.current) clearInterval(redirectTimer.current);
      setRedirectCountdown(10);
      let count = 10;
      redirectTimer.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (redirectTimer.current) {
            clearInterval(redirectTimer.current);
            redirectTimer.current = null;
          }
          setRedirectCountdown(null);
          discardDraft();
        } else {
          setRedirectCountdown(count);
        }
      }, 1000);
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

  async function rewriteCoverLetter() {
    if (!res || !coverLetterBody.trim() || rewritingCoverLetter) return;
    setRewritingCoverLetter(true);
    setMsg({ kind: "warn", text: t("new.rewriteCoverLetterTitle") });
    try {
      const r = await fetch("/api/rewrite-cover-letter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentCoverLetter: coverLetterBody,
          jobText: text,
          company: res.company,
          positions: res.applyFor && res.applyFor.length ? res.applyFor : (res.positions || []),
          language: res.language || "en",
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.body) throw new Error(d.error || "rewrite failed");
      setCoverLetterBody(d.body);
      setMsg({ kind: "ok", text: t("new.rewriteCoverLetterDone") });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ kind: "warn", text: t("new.rewriteCoverLetterFailed") });
      setTimeout(() => setMsg(null), 4000);
    } finally {
      setRewritingCoverLetter(false);
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
            <Link href="/app/bulk" className="text-secondary" style={{ fontSize: "var(--text-13)", textDecoration: "none" }}>{t("new.bulk")} →</Link>
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {t("new.recover.search")}
                  </a>
                </div>
              </div>
            )}
          </label>
          {res && (
            <div className="field" style={{ marginBottom: "var(--space-4)" }}>
              <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="field-label" style={{ margin: 0 }}>{t("new.chooseDraft")}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={regenerateWithDeepThinking}
                  disabled={analyzing || Boolean(refining) || sending}
                  style={{ fontSize: "var(--text-12)", minHeight: 28, padding: "0 var(--space-2)", gap: 4 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {t("new.deepThink")}
                </button>
              </div>
              {currentDrafts.length > 1 && (
                <div className="segmented" style={{ display: "flex", width: "100%" }}>
                  {currentDrafts.map((d, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`seg${selectedDraftIndex === index ? " active" : ""}`}
                      onClick={() => handleDraftSelect(index)}
                      style={{ minHeight: 34, fontSize: "var(--text-13)" }}
                    >
                      {d.style}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
              <span className="field-label" style={{ margin: 0 }}>{t("new.subject")}</span>
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
            <input className="input" value={subject} onChange={(e) => handleSubjectChange(e.target.value)} />
          </div>
          <div className="field">
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
              <span className="field-label" style={{ margin: 0 }}>{t("new.body")}</span>
              <span className="text-secondary" style={{ fontSize: "var(--text-12)", marginLeft: "auto" }}>
                {body.trim() ? body.trim().split(/\s+/).length : 0} {t("new.words")}
              </span>
            </div>
            <textarea className="textarea" style={{ minHeight: 260 }} value={body} onChange={(e) => handleBodyChange(e.target.value)} />
            
            {fullName && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <input
                  id="signature-checkbox"
                  type="checkbox"
                  checked={signatureChecked}
                  onChange={(e) => handleSignatureToggle(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label htmlFor="signature-checkbox" style={{ fontSize: "var(--text-13)", cursor: "pointer", fontWeight: 500, userSelect: "none" }}>
                  {t("new.addSignature")}
                </label>
              </div>
            )}

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

          {includeCoverLetter && (
            <div className="stack gap-3 reveal" style={{ marginTop: "var(--space-2)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
              <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span className="field-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {t("new.coverLetterTitle")}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: "var(--text-12)", minHeight: 28, padding: "0 var(--space-2)", gap: 6 }}
                  onClick={() => setCoverLetterPreviewOpen(!coverLetterPreviewOpen)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {coverLetterPreviewOpen ? (
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
                  {coverLetterPreviewOpen ? t("new.hidePreview") : t("new.preview")}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: coverLetterPreviewOpen ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr", gap: "var(--space-4)" }}>
                <div className="stack gap-2">
                  <span className="field-label" style={{ fontSize: "var(--text-12)", opacity: 0.7 }}>{t("new.coverLetterBody")}</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 280, height: "100%", resize: "vertical" }}
                    value={coverLetterBody}
                    onChange={(e) => setCoverLetterBody(e.target.value)}
                    placeholder={t("new.coverLetterBody")}
                  />
                </div>

                {coverLetterPreviewOpen && (
                  <div className="stack gap-2">
                    <span className="field-label" style={{ fontSize: "var(--text-12)", opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      {t("new.preview")}
                    </span>
                    <div style={{ flex: 1, minHeight: 280, maxHeight: 420, overflowY: "auto", padding: "var(--space-4)", background: "rgba(255,255,255,0.95)", color: "var(--content-primary)", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid var(--glass-stroke)", fontFamily: "Georgia, serif", fontSize: "12px", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <strong style={{ fontSize: "13px", color: "var(--content-primary)" }}>{fullName || res?.fullName || "Applicant"}</strong>
                        <span style={{ fontSize: "11px", color: "var(--content-secondary)" }}>{contactEmail || res?.contactEmail || ""}</span>
                      </div>

                      <div style={{ color: "var(--content-secondary)", fontSize: "10px", marginTop: "2px" }}>
                        {(COVER_LETTER_L10N[res?.language || "en"] || COVER_LETTER_L10N.en).formatDate(new Date())}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                        <strong style={{ color: "var(--content-primary)" }}>{res?.company}</strong>
                        <span style={{ color: "var(--content-secondary)" }}>
                          {(COVER_LETTER_L10N[res?.language || "en"] || COVER_LETTER_L10N.en).hiringTeam}
                        </span>
                      </div>

                      <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "8px", color: "var(--content-primary)", textAlign: "justify" }}>
                        {coverLetterBody.split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                          <p key={i} style={{ margin: 0 }}>{p}</p>
                        ))}
                      </div>

                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span>
                          {(COVER_LETTER_L10N[res?.language || "en"] || COVER_LETTER_L10N.en).sincerely}
                        </span>
                        <strong style={{ color: "var(--content-primary)" }}>{fullName || res?.fullName || "Applicant"}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>


              {/* Cover Letter Quality Check Widget */}
              <div className="glass card stack gap-3" style={{ background: "rgba(255,255,255,0.02)", padding: "var(--space-3)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)" }}>
                <span className="field-label" style={{ margin: 0, fontSize: "var(--text-13)", opacity: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {t("new.coverLetterChecklist")}
                </span>
                
                <div className="stack gap-2" style={{ marginTop: "var(--space-1)" }}>
                  {/* Rule 1: Includes company name */}
                  <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-13)" }}>
                    {coverLetterBody.toLowerCase().includes((res?.company || "").toLowerCase()) ? (
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
                    <strong className="chip chip-sm" style={{ fontSize: "var(--text-11)" }}>{res?.company || "—"}</strong>
                  </div>

                  {/* Rule 2: Includes target roles */}
                  {(() => {
                    const roles = (res?.applyFor?.length ? res.applyFor : res?.positions || []);
                    const matchedRole = roles.find(r => coverLetterBody.toLowerCase().includes(r.toLowerCase()));
                    const hasMatched = Boolean(matchedRole);
                    return (
                      <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-13)" }}>
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
                            <strong key={r} className={`chip chip-sm ${matchedRole === r ? "chip-accent" : ""}`} style={{ fontSize: "var(--text-11)" }}>
                              {r}
                            </strong>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rule 3: Avoids email specific keywords */}
                  {(() => {
                    const hasEmailPhrases = /attached (to )?this email|email attachment|attachment in this mail|e-postada|ekli mail|bu mail|e-posta eki|dosya ektedir|ek e-posta/i.test(coverLetterBody);
                    return (
                      <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-13)" }}>
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
                        {hasEmailPhrases && (
                          <span className="text-secondary" style={{ fontSize: "var(--text-11)", color: "var(--signal-warning, #f59e0b)" }}>
                            (Found email references)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Rule 4: Custom tailored status */}
                  {(() => {
                    const roles = (res?.applyFor?.length ? res.applyFor : res?.positions || []);
                    const hasMatched = roles.some(r => coverLetterBody.toLowerCase().includes(r.toLowerCase()));
                    const hasCompany = coverLetterBody.toLowerCase().includes((res?.company || "").toLowerCase());
                    const isTailored = hasMatched && hasCompany;
                    return (
                      <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-13)" }}>
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

                  {/* Rule 5: AI personalized */}
                  {res?.draftSource === "ai" && (
                    <div className="row gap-2" style={{ alignItems: "center", fontSize: "var(--text-13)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--signal-success, #10b981)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-secondary">{t("new.coverLetterCheck.aiGenerated")}</span>
                      <span className="chip chip-sm chip-accent" style={{ fontSize: "var(--text-10)", padding: "1px 6px" }}>{t("new.aiLabel")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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
                <button className="btn btn-primary" data-loading={sending} onClick={() => res && doSend({ to, subject, body, meta: res })} disabled={sending || res.overLimit}>
                  {sending ? t("new.sending") : t("new.send")}
                </button>
              </div>
            </div>
            <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => handleCoverLetterToggle(e.target.checked)}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <span>{msg.text}</span>
            {msg.kind === "ok" && redirectCountdown !== null && (
              <span style={{ fontSize: "var(--text-12)", opacity: 0.85, fontWeight: 500 }}>
                {t("new.redirecting").replace("{seconds}", String(redirectCountdown))}
              </span>
            )}
          </div>
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

      {coverLetterPreviewOpen && res && (
        <div className="confirm-overlay" onClick={() => setCoverLetterPreviewOpen(false)}>
          <div className="glass glass-strong confirm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: "94%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", padding: "var(--space-5)", gap: "var(--space-4)" }}>
            <div className="row gap-3" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--text-16)", fontWeight: 600, color: "var(--content-primary)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {t("new.coverLetterTitle")}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setCoverLetterPreviewOpen(false)}>{t("apps.detail.close")}</button>
            </div>

            {(() => {
              const loc = COVER_LETTER_L10N[res.language || "en"] || COVER_LETTER_L10N.en;
              return (
                <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-6) var(--space-8)", background: "rgba(255,255,255,0.97)", color: "#1a1a2e", borderRadius: "var(--radius-soft)", fontFamily: "Georgia, serif", fontSize: "14px", lineHeight: "1.7", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", color: "#0f172a" }}>{fullName || res.fullName || ""}</strong>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{contactEmail || res.contactEmail || ""}</span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "12px" }}>{loc.formatDate(new Date())}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ color: "#0f172a" }}>{res.company}</strong>
                    <span style={{ color: "#64748b" }}>{loc.hiringTeam}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", color: "#1e293b", textAlign: "justify" }}>
                    {coverLetterBody.split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                      <p key={i} style={{ margin: 0 }}>{p}</p>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                    <span style={{ color: "#1e293b" }}>{loc.sincerely}</span>
                    <strong style={{ color: "#0f172a" }}>{fullName || res.fullName || ""}</strong>
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
