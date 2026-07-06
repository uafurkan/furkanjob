"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { APP_LANGS } from "@/lib/engine/template";
import { checkRecipients, applyFix } from "@/lib/email-check";
import { safeJson } from "@/lib/safe-fetch";

type Eligibility = { status: "ok" | "warning" | "blocked"; note: string };
type GenResult = {
  company: string;
  country: string;
  orgType?: string;
  intent?: "job" | "study";
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

// Deterministic safety net for when the AI returns a revised body but skips the subject: swap
// the old "Role1 / Role2" role list for the new one inside the existing subject string, so a
// role toggle never leaves a stale subject even if that particular provider only did half the job.
function fallbackSubject(currentSubject: string, oldRoles: string[], newRoles: string[]): string {
  const oldJoined = oldRoles.join(" / ");
  if (oldJoined && currentSubject.includes(oldJoined)) {
    return currentSubject.replace(oldJoined, newRoles.join(" / "));
  }
  return currentSubject;
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
  const [toInput, setToInput] = useState("");
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
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [bodyBeforeRefine, setBodyBeforeRefine] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null);
  const undoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSendData = useRef<{ to: string; subject: string; body: string; meta: GenResult } | null>(null);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(0);
  const [currentDrafts, setCurrentDrafts] = useState<{ subject: string; body: string; style: string }[]>([]);
  const [signatureChecked, setSignatureChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [coverLetterPreviewOpen, setCoverLetterPreviewOpen] = useState(false);
  const [rewritingCoverLetter, setRewritingCoverLetter] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<string | null>(null);
  const [askRevisedBody, setAskRevisedBody] = useState<string | null>(null);
  const [askRevisedSubject, setAskRevisedSubject] = useState<string | null>(null);
  const [askRevisedCoverLetter, setAskRevisedCoverLetter] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const fetchedUrlRef = useRef<string | null>(null);
  const [profileTargetRoles, setProfileTargetRoles] = useState<string[]>([]);
  const [rolesSyncing, setRolesSyncing] = useState<string | null>(null);

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

  // Escape during undo countdown → undo
  useEffect(() => {
    if (undoCountdown === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); handleUndo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoCountdown]);

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

  // Load the user's saved target roles (for the toggleable role chips on a result).
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.profile?.targetRoles) setProfileTargetRoles(d.profile.targetRoles); })
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
    if (undoTimer.current) {
      clearInterval(undoTimer.current);
      undoTimer.current = null;
    }
    setUndoCountdown(null);
    pendingSendData.current = null;
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

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearInterval(undoTimer.current);
    };
  }, []);

  const handleDraftSelect = (index: number) => {
    setSelectedDraftIndex(index);
    const targetDraft = currentDrafts[index];
    if (!targetDraft) return;

    let targetBody = targetDraft.body;
    if (signatureChecked && fullName && !targetBody.includes("Sincerely,")) {
      targetBody = targetBody.trim() + `\n\nSincerely,\n${fullName}`;
    } else if (!signatureChecked && targetBody.includes("Sincerely,")) {
      targetBody = targetBody.replace(`\n\nSincerely,\n${fullName}`, "").replace(/\n\nSincerely,\n.*$/, "").trim();
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

    const sigText = `\n\nSincerely,\n${fullName}`;
    if (checked) {
      if (!body.includes("Sincerely,")) {
        setBody((prev) => prev.trim() + sigText);
        setCurrentDrafts((prev) =>
          prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: d.body.trim() + sigText } : d))
        );
      }
      if (coverLetterBody && !coverLetterBody.includes("Sincerely,")) {
        setCoverLetterBody((prev) => prev.trim() + sigText);
      }
    } else {
      if (body.includes("Sincerely,")) {
        const cleanBody = body.replace(sigText, "").replace(/\n\nSincerely,\n.*$/, "").trim();
        setBody(cleanBody);
        setCurrentDrafts((prev) =>
          prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: cleanBody } : d))
        );
      }
      if (coverLetterBody && coverLetterBody.includes("Sincerely,")) {
        const cleanCl = coverLetterBody.replace(sigText, "").replace(/\n\nSincerely,\n.*$/, "").trim();
        setCoverLetterBody(cleanCl);
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

  // Auto-fetch URL: when the textarea contains only a URL, automatically scrape it.
  function looksLikeUrl(s: string): boolean {
    const t = s.trim();
    if (/\n/.test(t)) return false; // multi-line → not a bare URL
    return /^https?:\/\/\S+$/i.test(t) || /^www\.\S+$/i.test(t) || /^[a-z0-9][a-z0-9.-]*\.(com|co\.nz|co\.uk|com\.au|nz|au|org|net|io|ca|de|fr|es|it|nl|pt|ie|at|ch|gr|se|dk|no|be|fi|cz|pl)(\/.*)?\.?$/i.test(t);
  }

  useEffect(() => {
    const trimmed = text.trim();
    if (!trimmed || !looksLikeUrl(trimmed) || fetchingUrl || analyzing) return;
    // Don't re-fetch if we already fetched this exact URL
    if (fetchedUrlRef.current === trimmed) return;
    
    const timer = setTimeout(async () => {
      // Re-check in case text changed during the delay
      if (!looksLikeUrl(text.trim())) return;
      setFetchingUrl(true);
      setMsg({ kind: "ok", text: t("new.fetchingUrl") || "Fetching page content…" });
      try {
        const r = await fetch("/api/fetch-page", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: text.trim() }),
        });
        const d = await safeJson(r);
        if (r.ok && d.text) {
          fetchedUrlRef.current = trimmed;
          setText(d.text);
          setMsg({ kind: "ok", text: t("new.fetchedUrl") || "Page content loaded — ready to analyze!" });
        } else {
          setMsg({ kind: "warn", text: d.error || "Could not fetch the page." });
        }
      } catch {
        setMsg({ kind: "warn", text: "Could not fetch the page." });
      } finally {
        setFetchingUrl(false);
      }
    }, 600); // Small delay so typing a URL doesn't trigger mid-type
    return () => clearTimeout(timer);
  }, [text, fetchingUrl, analyzing]);

  const srcLabel = (s: string) =>
    ({ text: t("new.src.text"), "page-scrape": t("new.src.scrape"), "web-search": t("new.src.web"), none: t("new.src.none") } as Record<string, string>)[s] || s;
  const langLabel = (c: string) => APP_LANGS.find((l) => l.code === c)?.label || c;

  async function analyze() {
    if (!text.trim()) return setMsg({ kind: "warn", text: t("new.pasteFirst") });
    setAnalyzing(true);
    setStage(t("new.stage.analyzing"));
    setMsg(null);
    setRes(null);
    setAskResponse(null);
    setAskRevisedBody(null);
    setAskError(null);
    setShowCustomInput(false);
    setCustomQuestion("");
    const stageTimer1 = setTimeout(() => setStage(t("new.stage.searching")), 1400);
    const stageTimer = setTimeout(() => setStage(t("new.stage.drafting")), 3800);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      const d: GenResult = await safeJson(r);
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
        initialBody = initialBody.trim() + `\n\nSincerely,\n${d.fullName}`;
        setSignatureChecked(true);
      } else {
        setSignatureChecked(false);
      }
      setSubject(parsedDrafts[0].subject);
      setBody(initialBody);
      let initialClBody = d.coverLetterBody;
      if (!initialClBody) {
        initialClBody = parsedDrafts[0].body;
      }
      if (isSigChecked && d.fullName && !initialClBody.includes("Sincerely,")) {
        initialClBody = initialClBody.trim() + `\n\nSincerely,\n${d.fullName}`;
      }
      setCoverLetterBody(initialClBody);
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
        await executeActualSend({ to: toVal, subject: parsedDrafts[0].subject, body: initialBody, meta: d });
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
      const d: GenResult = await safeJson(r);
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
        initialBody = initialBody.trim() + `\n\nSincerely,\n${d.fullName}`;
        setSignatureChecked(true);
      } else {
        setSignatureChecked(false);
      }
      setSubject(parsedDrafts[0].subject);
      setBody(initialBody);
      let initialClBody = d.coverLetterBody;
      if (!initialClBody) {
        initialClBody = parsedDrafts[0].body;
        if (d.fullName) {
          initialClBody = initialClBody.trim() + `\n\nSincerely,\n${d.fullName}`;
        }
      }
      setCoverLetterBody(initialClBody);
      setDraftRestoredAt(null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setAnalyzing(false);
      setStage(null);
    }
  }

  async function executeActualSend(p: { to: string; subject: string; body: string; meta: GenResult }) {
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
      const d = await safeJson(r);
      if (r.status === 402) { setMsg({ kind: "warn", text: t("new.limitReached") }); return; }
      if (!r.ok) throw new Error(d.error || "Error");
      const attachLabel = d.coverLetterAttached ? t("new.coverLetterAttached") : d.cvAttached ? t("new.cvAttached") : t("new.cvNone");
      const okText = `${d.sentTo.join(", ")} ${attachLabel}`;
      discardDraft();
      setMsg({ kind: "ok", text: okText });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  function doSend(p: { to: string; subject: string; body: string; meta: GenResult }) {
    if (!p.to.trim()) return setMsg({ kind: "err", text: t("new.enterRecipient") });
    pendingSendData.current = p;
    if (undoTimer.current) clearInterval(undoTimer.current);
    setUndoCountdown(10);
    let count = 10;
    undoTimer.current = setInterval(() => {
      count--;
      if (count <= 0) {
        if (undoTimer.current) { clearInterval(undoTimer.current); undoTimer.current = null; }
        setUndoCountdown(null);
        const pending = pendingSendData.current;
        pendingSendData.current = null;
        if (pending) executeActualSend(pending);
      } else {
        setUndoCountdown(count);
      }
    }, 1000);
  }

  function handleUndo() {
    if (undoTimer.current) { clearInterval(undoTimer.current); undoTimer.current = null; }
    setUndoCountdown(null);
    pendingSendData.current = null;
  }

  async function handleNewApplication() {
    if (undoTimer.current) { clearInterval(undoTimer.current); undoTimer.current = null; }
    setUndoCountdown(null);
    const pending = pendingSendData.current;
    pendingSendData.current = null;
    if (pending) await executeActualSend(pending);
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
      const d = await safeJson(r);
      if (!r.ok || !d.body) throw new Error(d.error || "refine failed");
      setBodyBeforeRefine(prev);
      
      let finalBody = d.body;
      if (signatureChecked && fullName && !finalBody.includes("Sincerely,")) {
        finalBody = finalBody.trim() + `\n\nSincerely,\n${fullName}`;
      }
      setBody(finalBody);
      setCurrentDrafts((prevDrafts) =>
        prevDrafts.map((draft, i) => (i === selectedDraftIndex ? { ...draft, body: finalBody } : draft))
      );
    } catch {
      setMsg({ kind: "warn", text: t("new.refine.failed") });
    } finally {
      setRefining(null);
    }
  }

  async function handleAskAI(q: string) {
    if (!res || !body.trim() || askLoading || !q.trim()) return;
    setAskLoading(true);
    setAskResponse(null);
    setAskRevisedBody(null);
    setAskRevisedSubject(null);
    setAskRevisedCoverLetter(null);
    setAskError(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          subject,
          coverLetter: includeCoverLetter ? coverLetterBody : undefined,
          jobText: text,
          question: q,
          company: res.company,
          countryName: res.country,
          orgType: res.orgType,
          applyFor: res.applyFor && res.applyFor.length ? res.applyFor : res.positions,
          language: res.language,
        }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || "Ask AI failed");
      setAskResponse(d.answer);
      if (d.revisedBody) setAskRevisedBody(d.revisedBody);
      if (d.revisedSubject) setAskRevisedSubject(d.revisedSubject);
      if (d.revisedCoverLetter) setAskRevisedCoverLetter(d.revisedCoverLetter);
    } catch (e: any) {
      setAskError(e.message || "An error occurred");
    } finally {
      setAskLoading(false);
    }
  }

  // Add/remove a role from this application by tapping its chip. This is a mechanical edit
  // (swap the role list), not a free-text request, so it goes to the deterministic template
  // engine (/api/roles-draft) instead of the AI chat path — instant, free, never depends on an
  // AI provider's uptime/quota. Trade-off: this rebuilds subject+body from scratch, so any manual
  // edits the user made to the body are lost (same as regenerating). The cover letter isn't
  // regenerated (no deterministic cover-letter engine exists) — we just swap the role names
  // inside it, same trick as the subject fallback.
  async function toggleRole(role: string) {
    if (!res || rolesSyncing) return;
    const current = res.applyFor && res.applyFor.length ? res.applyFor : res.positions;
    const isActive = current.some((r) => r.toLowerCase() === role.toLowerCase());
    const next = isActive ? current.filter((r) => r.toLowerCase() !== role.toLowerCase()) : [...current, role];
    if (!next.length) {
      setMsg({ kind: "warn", text: t("new.roles.needOne") });
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setRolesSyncing(role);
    try {
      const r = await fetch("/api/roles-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: res.company,
          countryCode: res.countryCode,
          orgType: res.orgType,
          applyFor: next,
          language: res.language,
        }),
      });
      const d = await safeJson(r);
      if (!r.ok || !d.body) throw new Error(d.error || t("new.roles.failed"));

      setRes((prev) => (prev ? { ...prev, applyFor: next } : prev));

      setBodyBeforeRefine(body);
      let finalBody = d.body;
      if (signatureChecked && fullName && !finalBody.includes("Sincerely,")) {
        finalBody = finalBody.trim() + `\n\nSincerely,\n${fullName}`;
      }
      setBody(finalBody);
      setCurrentDrafts((prev) => prev.map((dr, i) => (i === selectedDraftIndex ? { ...dr, body: finalBody } : dr)));

      setSubject(d.subject);
      setCurrentDrafts((prev) => prev.map((dr, i) => (i === selectedDraftIndex ? { ...dr, subject: d.subject } : dr)));

      if (includeCoverLetter) setCoverLetterBody((prev) => fallbackSubject(prev, current, next));

      setMsg({ kind: "ok", text: t("new.roles.updated") });
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg({ kind: "warn", text: e.message || t("new.roles.failed") });
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setRolesSyncing(null);
    }
  }

  function applyAskRevision() {
    if (!askRevisedBody && !askRevisedSubject && !askRevisedCoverLetter) return;
    if (askRevisedBody) {
      setBodyBeforeRefine(body);
      let finalBody = askRevisedBody;
      if (signatureChecked && fullName && !finalBody.includes("Sincerely,")) {
        finalBody = finalBody.trim() + `\n\nSincerely,\n${fullName}`;
      }
      setBody(finalBody);
      setCurrentDrafts((prev) =>
        prev.map((d, i) => (i === selectedDraftIndex ? { ...d, body: finalBody } : d))
      );
    }
    if (askRevisedSubject) {
      setSubject(askRevisedSubject);
      setCurrentDrafts((prev) =>
        prev.map((d, i) => (i === selectedDraftIndex ? { ...d, subject: askRevisedSubject } : d))
      );
    }
    if (askRevisedCoverLetter && includeCoverLetter) {
      setCoverLetterBody(askRevisedCoverLetter);
    }
    setAskRevisedBody(null);
    setAskRevisedSubject(null);
    setAskRevisedCoverLetter(null);
    setAskResponse("Revision applied!");
  }

  async function rewriteCoverLetter() {
    if (!res || !coverLetterBody.trim() || rewritingCoverLetter) return;
    setRewritingCoverLetter(true);
    setMsg({ kind: "ok", text: t("new.rewriteCoverLetterTitle") });
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
      const d = await safeJson(r);
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
          <textarea ref={textareaRef} className="textarea" placeholder={t("new.placeholder")} value={text} onChange={(e) => setText(e.target.value)} disabled={fetchingUrl} style={fetchingUrl ? { opacity: 0.6 } : undefined} />
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
          <button className="btn btn-primary" data-loading={analyzing || sending || fetchingUrl} onClick={analyze} disabled={analyzing || sending || fetchingUrl}>
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
            {(() => {
              const active = res.applyFor && res.applyFor.length ? res.applyFor : res.positions;
              const seen = new Set<string>();
              const options: string[] = [];
              for (const r of [...active, ...profileTargetRoles, ...(res.droppedRoles || [])]) {
                const key = r.trim().toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                options.push(r.trim());
              }
              return options.map((role) => {
                const isActive = active.some((r) => r.toLowerCase() === role.toLowerCase());
                return (
                  <button
                    key={role}
                    type="button"
                    className={`chip chip-toggle ${isActive ? "chip-accent" : ""}`}
                    disabled={rolesSyncing !== null}
                    data-loading={rolesSyncing === role}
                    title={isActive ? t("new.roles.removeHint") : t("new.roles.addHint")}
                    onClick={() => toggleRole(role)}
                  >
                    <span className="chip-toggle-icon" aria-hidden="true">{isActive ? "×" : "+"}</span>
                    {role}{rolesSyncing === role ? "…" : ""}
                  </button>
                );
              });
            })()}
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
            <div
              className={`email-pill-container${recipientIssue?.kind === "invalid" && recipientIssue.value === toInput ? " invalid" : ""}`}
              onClick={() => {
                const inp = document.getElementById("email-pill-input-field");
                if (inp) inp.focus();
              }}
            >
              {to.split(/[,;]/).map((e) => e.trim()).filter(Boolean).map((email, idx, emailPills) => {
                const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                return (
                  <span key={idx} className={`email-pill${isValid ? "" : " invalid"}`}>
                    {email}
                    <button
                      type="button"
                      className="email-pill-remove"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        const updated = emailPills.filter((_, i) => i !== idx).join(", ");
                        setTo(updated);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
              <input
                id="email-pill-input-field"
                className="email-pill-input"
                placeholder={to.split(/[,;]/).map((e) => e.trim()).filter(Boolean).length === 0 ? "name@business.com" : ""}
                value={toInput}
                onChange={(e) => {
                  const val = e.target.value;
                  const emailPills = to.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
                  if (/[\s,;]/.test(val)) {
                    const parts = val.split(/[\s,;]+/);
                    const lastPart = parts.pop() || "";
                    const completed = parts.map(p => p.trim()).filter(Boolean);
                    
                    const isLastValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lastPart);
                    if (isLastValid) {
                      completed.push(lastPart);
                      setTo([...emailPills, ...completed].join(", "));
                      setToInput("");
                    } else {
                      setTo([...emailPills, ...completed].join(", "));
                      setToInput(lastPart);
                    }
                  } else {
                    setToInput(val);
                  }
                }}
                onKeyDown={(e) => {
                  const emailPills = to.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = toInput.trim();
                    if (trimmed) {
                      setTo([...emailPills, trimmed].join(", "));
                      setToInput("");
                    }
                  } else if (e.key === "Backspace" && !toInput) {
                    if (emailPills.length > 0) {
                      const updated = emailPills.slice(0, -1).join(", ");
                      setTo(updated);
                    }
                  }
                }}
                onBlur={() => {
                  const trimmed = toInput.trim();
                  const emailPills = to.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
                  if (trimmed) {
                    setTo([...emailPills, trimmed].join(", "));
                    setToInput("");
                  }
                }}
              />
            </div>
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

            {true && (
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
                    onClick={() => {
                      if (!bodyBeforeRefine) return;
                      let finalBody = bodyBeforeRefine;
                      if (signatureChecked && fullName && !finalBody.includes("Sincerely,")) {
                        finalBody = finalBody.trim() + `\n\nSincerely,\n${fullName}`;
                      }
                      setBody(finalBody);
                      setCurrentDrafts((prev) =>
                        prev.map((draft, i) => (i === selectedDraftIndex ? { ...draft, body: finalBody } : draft))
                      );
                      setBodyBeforeRefine(null);
                    }}
                  >
                    ↩ {t("new.refine.undo")}
                  </button>
                )}
              </div>
            )}

            {/* Ask AI Chat Panel */}
            {true && (
              <div style={{
                background: "rgba(30, 41, 59, 0.55)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                marginTop: "var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span style={{ fontSize: "var(--text-14)", fontWeight: 600, color: "#f1f5f9" }}>
                    Ask about this application
                  </span>
                  {(askResponse || askError || askLoading || showCustomInput) && (
                    <button
                      type="button"
                      style={{
                        marginLeft: "auto",
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                      onClick={() => {
                        setAskResponse(null);
                        setAskRevisedBody(null);
                        setAskError(null);
                        setShowCustomInput(false);
                        setCustomQuestion("");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    "Is the tone appropriate for a hospitality role in New Zealand?",
                    "Should I mention my visa status earlier in the email?",
                    "Is the email length within the ideal range for a concise application?"
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={askLoading}
                      onClick={() => handleAskAI(q)}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "20px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        color: "#cbd5e1",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s ease"
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                        e.currentTarget.style.color = "#fff";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                        e.currentTarget.style.color = "#cbd5e1";
                      }}
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={askLoading}
                    onClick={() => setShowCustomInput(true)}
                    style={{
                      background: "rgba(99, 102, 241, 0.15)",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                      borderRadius: "20px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      color: "#a5b4fc",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
                    }}
                  >
                    + Other...
                  </button>
                </div>

                {showCustomInput && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskAI(customQuestion);
                    }}
                    style={{ display: "flex", gap: 8, marginTop: 4 }}
                  >
                    <input
                      className="input"
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="Ask anything or request changes (e.g., 'Make it more enthusiastic' or 'Add my barista experience')"
                      disabled={askLoading}
                      style={{
                        flex: 1,
                        background: "rgba(15, 23, 42, 0.5)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#fff"
                      }}
                    />
                    <button
                      type="submit"
                      className="btn btn-accent btn-sm"
                      disabled={askLoading || !customQuestion.trim()}
                    >
                      Send
                    </button>
                  </form>
                )}

                {askLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: "13px", padding: "4px 0" }}>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Analyzing draft...
                  </div>
                )}

                {askError && (
                  <div style={{ color: "var(--signal-warning)", fontSize: "13px" }}>
                    ⚠️ {askError}
                  </div>
                )}

                {askResponse && (
                  <div style={{
                    background: "rgba(15, 23, 42, 0.4)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-3)",
                    borderLeft: "3px solid var(--accent)",
                    marginTop: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11px", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>
                      AI Application Coach
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5 }}>
                      {askResponse}
                    </p>
                    {(askRevisedBody || askRevisedSubject || askRevisedCoverLetter) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {askRevisedSubject && (
                          <p style={{ margin: 0, fontSize: "11px", color: "var(--content-tertiary)" }}>
                            Subject → <em>{askRevisedSubject}</em>
                          </p>
                        )}
                        {askRevisedCoverLetter && includeCoverLetter && (
                          <p style={{ margin: 0, fontSize: "11px", color: "var(--content-tertiary)" }}>
                            Cover letter will also be updated.
                          </p>
                        )}
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          style={{ alignSelf: "flex-start" }}
                          onClick={applyAskRevision}
                        >
                          Apply Revision
                        </button>
                      </div>
                    )}
                  </div>
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
                    <div style={{ flex: 1, minHeight: 280, maxHeight: 420, overflowY: "auto", padding: "var(--space-4) var(--space-4)", background: "#ffffff", color: "#1e293b", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", fontFamily: "Georgia, serif", fontSize: "12px", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <strong style={{ fontSize: "13px", color: "#0f172a" }}>{fullName || res?.fullName || "Applicant"}</strong>
                      </div>

                      <div style={{ color: "#64748b", fontSize: "10px", marginTop: "2px" }}>
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
                          const lang = res?.language || "en";
                          const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                          return loc.formatDate(new Date());
                        })()}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                        <strong style={{ color: "#0f172a" }}>{res?.company}</strong>
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
                            const lang = res?.language || "en";
                            const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                            return loc.hiringTeam;
                          })()}
                        </span>
                      </div>

                      <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "8px", color: "#334155", textAlign: "justify" }}>
                        {coverLetterBody.split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                          <p key={i} style={{ margin: 0 }}>{p}</p>
                        ))}
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
                {undoCountdown !== null ? (
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <span style={{ fontSize: "var(--text-13)", color: "var(--content-secondary)", minWidth: 20, textAlign: "center" }}>{undoCountdown}s</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleUndo}>↩ {t("new.undo")}</button>
                    <button type="button" className="btn btn-sm" data-loading={sending} onClick={handleNewApplication}>{t("new.another")} →</button>
                  </div>
                ) : (
                  <button className="btn btn-primary" data-loading={sending} onClick={() => res && doSend({ to, subject, body, meta: res })} disabled={sending || res.overLimit}>
                    {sending ? t("new.sending") : t("new.send")}
                  </button>
                )}
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
        <div className={`notice notice-${msg.kind} reveal`}>
          <span>{msg.text}</span>
        </div>
      )}

      {coverLetterPreviewOpen && res && (
        <div className="confirm-overlay" onClick={() => setCoverLetterPreviewOpen(false)}>
          <div className="confirm-modal cl-preview-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: "94%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", padding: "var(--space-4)" }}>
            <div className="detail-header" style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "var(--space-3)", marginBottom: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="detail-company" style={{ fontSize: "var(--text-16)", fontWeight: 600 }}>📄 {t("new.coverLetterTitle")} ({t("new.preview")})</span>
              <button className="btn btn-sm" onClick={() => setCoverLetterPreviewOpen(false)}>{t("apps.detail.close")}</button>
            </div>
            
            {/* Styled "A4" Document Preview Box */}
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4) var(--space-5)", background: "#ffffff", color: "#1e293b", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", fontFamily: "Georgia, serif", fontSize: "14px", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Sender Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "16px", color: "#0f172a" }}>{fullName || res.fullName || ""}</strong>
                <span style={{ fontSize: "12px", color: "#64748b" }}>{contactEmail || res.contactEmail || ""}</span>
              </div>
              
              {/* Date */}
              <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
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
                  const lang = res.language || "en";
                  const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                  return loc.formatDate(new Date());
                })()}
              </div>
              
              {/* Company Info */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                <strong style={{ color: "#0f172a" }}>{res.company}</strong>
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
                    const lang = res.language || "en";
                    const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                    return loc.hiringTeam;
                  })()}
                </span>
              </div>
              
              {/* Document Body Paragraphs */}
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px", color: "#334155", textAlign: "justify" }}>
                {coverLetterBody.split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                  <p key={i} style={{ margin: 0 }}>{p}</p>
                ))}
              </div>
              
              {/* Closing */}
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
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
                    const lang = res.language || "en";
                    const loc = COVER_LETTER_L10N[lang] || COVER_LETTER_L10N.en;
                    return loc.sincerely;
                  })()}
                </span>
                <strong style={{ color: "#0f172a" }}>{fullName || res.fullName || ""}</strong>
              </div>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
