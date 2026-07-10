"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { safeJson } from "@/lib/safe-fetch";

type Status = "queued" | "analyzing" | "drafted" | "sending" | "sent" | "failed" | "skipped";

type Eligibility = { status: "ok" | "warning" | "blocked"; note: string };

type Item = {
  id: number;
  input: string;
  status: Status;
  company?: string;
  country?: string;
  countryCode?: string;
  orgType?: string;
  emailSource?: string;
  to: string;
  subject: string;
  body: string;
  coverLetterBody?: string;
  includeCoverLetter?: boolean;
  language?: string;
  positions?: string[];
  applyFor?: string[];
  droppedRoles?: string[];
  fitScore?: number;
  fitSummary?: string;
  eligibility?: Eligibility;
  overLimit?: boolean;
  error?: string;
  expanded?: boolean;
  showInlinePreview?: boolean;
  fullName?: string;
  signatureChecked?: boolean;
  thinking?: boolean;
  // Per-item "Ask about this application" chat — each queue item gets its own AI
  // conversation grounded in ITS OWN business text/draft, never shared across items.
  chatOpen?: boolean;
  chatLoading?: boolean;
  chatAnswer?: string | null;
  chatError?: string | null;
  chatShowCustomInput?: boolean;
  chatCustomQuestion?: string;
  chatRevisedBody?: string | null;
  chatRevisedSubject?: string | null;
  chatRevisedCoverLetter?: string | null;
  // Role currently being added/removed via the toggleable role chips (set while the AI rewrite is in flight).
  rolesSyncing?: string | null;
  // Intelligence data from /api/generate (same shape as single-apply page)
  visaIntelligence?: {
    onSkillShortageList: boolean;
    shortageListName: string | null;
    shortageStream: string | null;
    workingHolidayEligible: boolean;
    workingHolidayNote: string | null;
    panelNotes: string[];
    wording: string;
  } | null;
  intelligence?: {
    skillsGap: {
      matchedSkills: string[];
      gapSkills: string[];
      strengthHighlights: string[];
      experienceRequired: number | null;
      educationRequired: string;
    };
    sponsorshipSignal: "open" | "closed" | "unknown";
    sponsorshipNote: string | null;
    postingFreshness: "fresh" | "recent" | "old" | "unknown";
    postingAgeDays: number | null;
    freshnessNote: string | null;
    postingTone: string;
    whvTimeline: { monthsRemaining: number | null; urgencyLevel: string; note: string | null } | null;
    responseRate: { score: number; label: "high" | "medium" | "low"; factors: string[] };
  } | null;
  // Email health per address — fetched in the background after drafting
  emailHealth?: Record<string, { status: string; label: string; hint: string | null }>;
  forceHealthBypass?: boolean;
};

const MAX_ITEMS = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinRolesNatural(roles: string[], sep: string): string {
  if (roles.length <= 1) return roles[0] || "";
  return roles.slice(0, -1).join(", ") + ` ${sep} ` + roles[roles.length - 1];
}

function swapRolesInText(text: string, oldRoles: string[], newRoles: string[], natural: boolean): string {
  const separators = natural
    ? [" / ", " and ", " & ", " ve ", " und ", " et ", " e ", " y ", ", "]
    : [" / "];
  for (const sep of separators) {
    const oldJoined = oldRoles.join(sep);
    if (oldJoined && text.includes(oldJoined)) {
      return text.replace(oldJoined, natural ? joinRolesNatural(newRoles, sep.trim()) : newRoles.join(sep));
    }
  }
  if (natural && oldRoles.length > 1) {
    for (const conj of ["and", "ve", "und", "et", "e", "y", "&"]) {
      const oldNat = joinRolesNatural(oldRoles, conj);
      if (oldNat && text.includes(oldNat)) {
        return text.replace(oldNat, joinRolesNatural(newRoles, conj));
      }
    }
  }
  return text;
}

const COVER_LETTER_L10N: Record<string, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
  en: { hiringTeam: "Hiring Team", sincerely: "Sincerely,", formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
  tr: { hiringTeam: "İşe Alım Ekibi", sincerely: "Saygılarımla,", formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) },
  es: { hiringTeam: "Equipo de Selección", sincerely: "Atentamente,", formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) },
  fr: { hiringTeam: "Équipe de Recrutement", sincerely: "Cordialement,", formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) },
  de: { hiringTeam: "Personalabteilung", sincerely: "Mit freundlichen Grüßen,", formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) },
  it: { hiringTeam: "Ufficio Selezione", sincerely: "Cordiali saluti,", formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }) },
  pt: { hiringTeam: "Equipe de Recrutamento", sincerely: "Atenciosamente,", formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }) },
};

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
  const [profileTargetRoles, setProfileTargetRoles] = useState<string[]>([]);
  const stopRef = useRef(false);

  useEffect(() => {
    try {
      const coverPref = localStorage.getItem("paply:pref:includeCoverLetter");
      if (coverPref !== null) {
        setIncludeCoverLetter(coverPref === "true");
      }
    } catch {}
  }, []);

  // Load the user's saved target roles (for the toggleable role chips on each queue item).
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.profile?.targetRoles) setProfileTargetRoles(d.profile.targetRoles); })
      .catch(() => {});
  }, []);

  function update(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function checkItemHealthById(id: number, toValue: string) {
    const addresses = toValue.split(/[,;\s]+/).map((s: string) => s.trim()).filter(Boolean);
    if (!addresses.length) return;
    const results: Record<string, { status: string; label: string; hint: string | null }> = {};
    await Promise.all(
      addresses.map(async (email) => {
        try {
          const r = await fetch(`/api/email-health?email=${encodeURIComponent(email)}`);
          if (r.ok) {
            const d = await r.json();
            results[email] = { status: d.status, label: d.label, hint: d.hint ?? null };
          }
        } catch {}
      })
    );
    update(id, { emailHealth: results });
  }

  async function analyzeItem(it: Item): Promise<Item> {
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: it.input, language }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || "error");

      let isSigChecked = d.includeSignature || false;
      try {
        const sigPref = localStorage.getItem("paply:pref:includeSignature");
        if (sigPref !== null) {
          isSigChecked = sigPref === "true";
        }
      } catch {}

      const fullName = d.fullName || "";
      const loc = COVER_LETTER_L10N[d.language || "en"] || COVER_LETTER_L10N.en;
      let initialBody = d.body;
      if (isSigChecked && fullName && !initialBody.includes(loc.sincerely)) {
        initialBody = initialBody.trim() + `\n\n${loc.sincerely}\n${fullName}`;
      }

      return {
        ...it,
        status: d.emailSource === "none" ? "skipped" : "drafted",
        company: d.company, country: d.country, countryCode: d.countryCode, orgType: d.orgType, emailSource: d.emailSource,
        to: (d.emails || []).join(", "), subject: d.subject, body: initialBody,
        coverLetterBody: d.coverLetterBody || initialBody,
        includeCoverLetter: includeCoverLetter,
        language: d.language, positions: d.positions, overLimit: d.overLimit,
        applyFor: d.applyFor, droppedRoles: d.droppedRoles,
        fitScore: d.fitScore, fitSummary: d.fitSummary, eligibility: d.eligibility,
        visaIntelligence: d.visaIntelligence || null,
        intelligence: d.intelligence || null,
        error: d.emailSource === "none" ? t("bulk.noEmail") : undefined,
        fullName: fullName,
        signatureChecked: isSigChecked,
      };
    } catch (e: any) {
      return { ...it, status: "failed", error: e.message };
    }
  }

  async function sendItem(it: Item, attempt = 0): Promise<Item> {
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
          forceSkipHealthCheck: it.forceHealthBypass === true,
        }),
      });
      // Email health block: surface the warning and flip forceHealthBypass so the next Send tap bypasses it.
      if (r.status === 422) {
        const d = await safeJson(r);
        if (d.healthBlock) {
          return { ...it, status: "drafted", forceHealthBypass: true, error: `${d.healthLabel || t("new.health.blocked")} — ${t("new.health.sendAnyway")}` };
        }
      }
      // Sending 15-20 items back-to-back can outrun the per-minute send rate limit —
      // wait out the server's Retry-After and retry rather than failing the tail of the queue.
      if (r.status === 429 && attempt < 4) {
        const retryAfterHeader = Number(r.headers.get("Retry-After"));
        const waitSec = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 15;
        update(it.id, { status: "sending", error: t("bulk.rateLimited").replace("{s}", String(waitSec)) });
        await sleep(waitSec * 1000);
        return sendItem(it, attempt + 1);
      }
      const d = await safeJson(r);
      if (r.status === 402) return { ...it, status: "failed", error: t("new.limitReached") };
      if (!r.ok) throw new Error(d.error || "error");
      return { ...it, status: "sent", error: undefined, forceHealthBypass: false };
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
        // Fire background email-health check for drafted items (non-blocking)
        if (it.status === "drafted" && it.to?.trim()) {
          checkItemHealthById(it.id, it.to);
        }
      }
      if (!stopRef.current && auto && it.status === "drafted" && !it.overLimit && it.to.trim() && it.eligibility?.status !== "blocked") {
        update(it.id, { status: "sending" });
        it = await sendItem(it);
        setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
        // Stay comfortably under the 12-sends-per-minute server limit instead of racing it.
        await sleep(4500);
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
    const toSend = items.filter((it) => it.status === "drafted" && it.to.trim() && it.eligibility?.status !== "blocked");
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
      await sleep(4500);
    }
    setRunning(false);
    stopRef.current = false;
  }

  function handleSignatureToggle(id: number, checked: boolean) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (!item.fullName) return { ...item, signatureChecked: checked };

        const loc = COVER_LETTER_L10N[item.language || "en"] || COVER_LETTER_L10N.en;
        const sigText = `\n\n${loc.sincerely}\n${item.fullName}`;
        let newBody = item.body;
        let newCoverLetterBody = item.coverLetterBody;
        if (checked) {
          if (!newBody.includes(loc.sincerely)) {
            newBody = newBody.trim() + sigText;
          }
          if (newCoverLetterBody && !newCoverLetterBody.includes(loc.sincerely)) {
            newCoverLetterBody = newCoverLetterBody.trim() + sigText;
          }
        } else {
          newBody = newBody.replace(sigText, "").replace(/\n\n[^\n]+\n[^\n]+$/, "").trim();
          if (newCoverLetterBody && newCoverLetterBody.includes(loc.sincerely)) {
            newCoverLetterBody = newCoverLetterBody.replace(sigText, "").replace(/\n\n[^\n]+\n[^\n]+$/, "").trim();
          }
        }

        return { ...item, signatureChecked: checked, body: newBody, coverLetterBody: newCoverLetterBody };
      })
    );
    try { localStorage.setItem("paply:pref:includeSignature", String(checked)); } catch {}
  }

  const [rewritingItemId, setRewritingItemId] = useState<number | null>(null);

  async function regenerateWithDeepThinkingForItem(id: number) {
    const it = items.find((x) => x.id === id);
    if (!it || it.status === "sending" || it.thinking) return;

    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, thinking: true, error: undefined } : x))
    );

    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: it.input,
          language: it.language || language,
          reasoningEffort: "high",
        }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || "error");

      let isSigChecked = it.signatureChecked || false;
      let initialBody = d.body;
      if (isSigChecked && d.fullName && !initialBody.includes("Sincerely,")) {
        initialBody = initialBody.trim() + `\n\nSincerely,\n${d.fullName}`;
      }

      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status: d.emailSource === "none" ? "skipped" : "drafted",
                company: d.company,
                country: d.country,
                countryCode: d.countryCode,
                orgType: d.orgType,
                emailSource: d.emailSource,
                to: (d.emails || []).join(", "),
                subject: d.subject,
                body: initialBody,
                coverLetterBody: d.coverLetterBody || initialBody,
                language: d.language,
                positions: d.positions,
                overLimit: d.overLimit,
                applyFor: d.applyFor,
                droppedRoles: d.droppedRoles,
                fitScore: d.fitScore,
                fitSummary: d.fitSummary,
                eligibility: d.eligibility,
                visaIntelligence: d.visaIntelligence || null,
                intelligence: d.intelligence || null,
                error: d.emailSource === "none" ? t("bulk.noEmail") : undefined,
                fullName: d.fullName || "",
                thinking: false,
              }
            : x
        )
      );
    } catch (e: any) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, thinking: false, error: e.message || "Failed to regenerate" }
            : x
        )
      );
    }
  }

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
      const d = await safeJson(r);
      if (!r.ok || !d.body) throw new Error(d.error || "rewrite failed");
      update(id, { coverLetterBody: d.body });
    } catch {
      // silently fail
    } finally {
      setRewritingItemId(null);
    }
  }

  async function askAboutItem(id: number, question: string) {
    const it = items.find((x) => x.id === id);
    if (!it || !it.body?.trim() || it.chatLoading || !question.trim()) return;
    update(id, { chatLoading: true, chatAnswer: null, chatRevisedBody: null, chatRevisedSubject: null, chatRevisedCoverLetter: null, chatError: null });
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: it.body,
          subject: it.subject,
          coverLetter: it.includeCoverLetter ? it.coverLetterBody : undefined,
          jobText: it.input,
          question,
          company: it.company,
          countryName: it.country,
          applyFor: it.applyFor && it.applyFor.length ? it.applyFor : it.positions,
          language: it.language,
        }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || "Ask AI failed");
      update(id, {
        chatLoading: false,
        chatAnswer: d.answer,
        chatRevisedBody: d.revisedBody || null,
        chatRevisedSubject: d.revisedSubject || null,
        chatRevisedCoverLetter: d.revisedCoverLetter || null,
      });
    } catch (e: any) {
      update(id, { chatLoading: false, chatError: e.message || "An error occurred" });
    }
  }

  function applyChatRevision(id: number) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (!it.chatRevisedBody && !it.chatRevisedSubject && !it.chatRevisedCoverLetter) return it;
        const loc = COVER_LETTER_L10N[it.language || "en"] || COVER_LETTER_L10N.en;
        let newBody = it.body;
        if (it.chatRevisedBody) {
          newBody = it.chatRevisedBody;
          if (it.signatureChecked && it.fullName && !newBody.includes(loc.sincerely)) {
            newBody = newBody.trim() + `\n\n${loc.sincerely}\n${it.fullName}`;
          }
        }
        return {
          ...it,
          body: newBody,
          subject: it.chatRevisedSubject || it.subject,
          coverLetterBody: it.chatRevisedCoverLetter || it.coverLetterBody,
          chatRevisedBody: null,
          chatRevisedSubject: null,
          chatRevisedCoverLetter: null,
          chatAnswer: "Revision applied!",
        };
      })
    );
  }

  // Add/remove a role from ONE queue item by tapping its chip. Mechanical edit (swap the role
  // list) → deterministic template engine (/api/roles-draft), not the AI chat path — instant,
  // free, never depends on AI provider uptime/quota. Rebuilds subject+body from scratch, so any
  // manual edits to that item's body are lost; the cover letter isn't regenerated (no
  // deterministic cover-letter engine), just has its role names swapped in place.
  async function toggleRoleForItem(id: number, role: string) {
    const it = items.find((x) => x.id === id);
    if (!it || it.rolesSyncing) return;
    const current = it.applyFor && it.applyFor.length ? it.applyFor : (it.positions || []);
    const isActive = current.some((r) => r.toLowerCase() === role.toLowerCase());
    const next = isActive ? current.filter((r) => r.toLowerCase() !== role.toLowerCase()) : [...current, role];
    if (!next.length) return;
    update(id, { rolesSyncing: role });
    try {
      const loc = COVER_LETTER_L10N[it.language || "en"] || COVER_LETTER_L10N.en;
      const r = await fetch("/api/roles-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: it.company,
          countryCode: it.countryCode,
          orgType: it.orgType,
          applyFor: next,
          language: it.language,
        }),
      });
      const d = await safeJson(r);
      if (!r.ok || !d.body) throw new Error(d.error || "Failed to update roles");

      let newBody = d.body;
      if (it.signatureChecked && it.fullName && !newBody.includes(loc.sincerely)) {
        newBody = newBody.trim() + `\n\n${loc.sincerely}\n${it.fullName}`;
      }
      update(id, {
        applyFor: next,
        body: newBody,
        subject: d.subject,
        coverLetterBody: it.includeCoverLetter ? swapRolesInText(it.coverLetterBody || "", current, next, true) : it.coverLetterBody,
        rolesSyncing: null,
      });
    } catch (e: any) {
      update(id, { rolesSyncing: null, error: e?.message || "Failed to update roles" });
      setTimeout(() => update(id, { error: undefined }), 3500);
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
                {(() => {
                  const active = it.applyFor && it.applyFor.length ? it.applyFor : (it.positions || []);
                  const seen = new Set<string>();
                  const options: string[] = [];
                  for (const r of [...active, ...profileTargetRoles, ...(it.droppedRoles || [])]) {
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
                        disabled={!!it.rolesSyncing}
                        data-loading={it.rolesSyncing === role}
                        title={isActive ? t("new.roles.removeHint") : t("new.roles.addHint")}
                        onClick={() => toggleRoleForItem(it.id, role)}
                      >
                        <span className="chip-toggle-icon" aria-hidden="true">{isActive ? "×" : "+"}</span>
                        {role}{it.rolesSyncing === role ? "…" : ""}
                      </button>
                    );
                  });
                })()}
                <span className={`chip ${statusClass[it.status]}`}>{t(`bulk.status.${it.status}`)}</span>
                {typeof it.fitScore === "number" && it.fitScore > 0 && (
                  <span className={`chip ${it.eligibility?.status === "blocked" ? "chip-warn" : it.eligibility?.status === "warning" ? "chip-warn" : "chip-accent"}`}>
                    {it.fitScore}/100
                  </span>
                )}
                {(it.status === "drafted" || it.status === "skipped") && (
                  <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => {
                    const opening = !it.expanded;
                    update(it.id, { expanded: opening });
                    // Trigger health check on first expand if not already done
                    if (opening && it.to?.trim() && !it.emailHealth) checkItemHealthById(it.id, it.to);
                  }}>
                    {it.expanded ? t("bulk.collapse") : t("bulk.review")}
                  </button>
                )}
              </div>
              {!it.expanded && it.subject && <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{it.subject}</span>}
              {!it.expanded && it.fitSummary && <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{it.fitSummary}</span>}
              {!it.expanded && it.droppedRoles && it.droppedRoles.length > 0 && (
                <span className="fit-dropped" style={{ fontSize: "var(--text-12)" }}>{t("new.fit.dropped").replace("{roles}", it.droppedRoles.join(", "))}</span>
              )}
              {!it.expanded && it.eligibility && it.eligibility.status !== "ok" && it.eligibility.note && (
                <span className={`fit-eligibility fit-eligibility-${it.eligibility.status}`} style={{ fontSize: "var(--text-12)" }}>{it.eligibility.note}</span>
              )}
              {it.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{it.error}</span>}

              {it.expanded && (
                <div className="stack gap-3">
                  {(it.fitSummary || (it.eligibility && it.eligibility.status !== "ok") || (it.droppedRoles && it.droppedRoles.length > 0)) && (
                    <div className={`fit-panel reveal fit-${it.eligibility?.status === "blocked" ? "blocked" : it.eligibility?.status === "warning" ? "warning" : "ok"}`}>
                      {typeof it.fitScore === "number" && it.fitScore > 0 && (
                        <div className="fit-head">
                          <span className="fit-score" aria-label={t("new.fit.score")}>{it.fitScore}<span className="fit-score-max">/100</span></span>
                          <span className="fit-score-label">{t("new.fit.score")}</span>
                        </div>
                      )}
                      {it.fitSummary && <p className="fit-summary">{it.fitSummary}</p>}
                      {it.droppedRoles && it.droppedRoles.length > 0 && (
                        <p className="fit-dropped">{t("new.fit.dropped").replace("{roles}", it.droppedRoles.join(", "))}</p>
                      )}
                      {it.eligibility && it.eligibility.status !== "ok" && it.eligibility.note && (
                        <p className={`fit-eligibility fit-eligibility-${it.eligibility.status}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span>{it.eligibility.note}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {/* Visa intelligence panel */}
                  {it.visaIntelligence && (it.visaIntelligence.onSkillShortageList || it.visaIntelligence.workingHolidayEligible || (it.visaIntelligence.panelNotes && it.visaIntelligence.panelNotes.length > 0)) && (
                    <div className="visa-intel-panel reveal">
                      <div className="visa-intel-head">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M7 15h2" /><path d="M11 15h6" />
                        </svg>
                        <span>{t("new.visa.pathways")}</span>
                      </div>
                      {it.visaIntelligence.onSkillShortageList && it.visaIntelligence.shortageListName && (
                        <p className="visa-intel-shortage">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          <span><strong>{it.visaIntelligence.shortageListName}</strong>{it.visaIntelligence.shortageStream ? ` — ${it.visaIntelligence.shortageStream}` : ""}</span>
                        </p>
                      )}
                      {it.visaIntelligence.workingHolidayEligible && it.visaIntelligence.workingHolidayNote && (
                        <p className="visa-intel-whv">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                          <span>{it.visaIntelligence.workingHolidayNote}</span>
                        </p>
                      )}
                      {it.visaIntelligence.panelNotes && it.visaIntelligence.panelNotes.slice(1).map((note, i) => (
                        <p key={i} className="visa-intel-note">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                          <span>{note}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Application intelligence panel */}
                  {it.intelligence && (
                    <div className="intel-panel reveal">
                      <div className="intel-panel-head">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                        </svg>
                        <span>{t("new.intel.title")}</span>
                        <span className={`intel-rate intel-rate--${it.intelligence.responseRate.label}`}>
                          {it.intelligence.responseRate.score}% {t(`new.intel.rate.${it.intelligence.responseRate.label}`)}
                        </span>
                      </div>
                      {it.intelligence.postingFreshness !== "unknown" && (
                        <p className={`intel-row intel-freshness--${it.intelligence.postingFreshness}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                          <span>
                            {it.intelligence.postingAgeDays === 0 ? t("new.intel.fresh.today")
                              : it.intelligence.postingAgeDays !== null ? t("new.intel.fresh.days").replace("{n}", String(it.intelligence.postingAgeDays))
                              : t(`new.intel.fresh.${it.intelligence.postingFreshness}`)}
                            {it.intelligence.freshnessNote ? ` — ${it.intelligence.freshnessNote}` : ""}
                          </span>
                        </p>
                      )}
                      {it.intelligence.sponsorshipSignal !== "unknown" && (
                        <p className={`intel-row intel-sponsor--${it.intelligence.sponsorshipSignal}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            {it.intelligence.sponsorshipSignal === "open" ? <path d="M20 6L9 17l-5-5"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                          </svg>
                          <span>{it.intelligence.sponsorshipNote}</span>
                        </p>
                      )}
                      {it.intelligence.skillsGap.matchedSkills.length > 0 && (
                        <div className="intel-skills">
                          <span className="intel-skills-label intel-skills-label--match">{t("new.intel.skills.matched")}</span>
                          {it.intelligence.skillsGap.matchedSkills.map((s, i) => <span key={i} className="intel-skill-chip intel-skill-chip--match">{s}</span>)}
                        </div>
                      )}
                      {it.intelligence.skillsGap.gapSkills.length > 0 && (
                        <div className="intel-skills">
                          <span className="intel-skills-label intel-skills-label--gap">{t("new.intel.skills.gap")}</span>
                          {it.intelligence.skillsGap.gapSkills.map((s, i) => <span key={i} className="intel-skill-chip intel-skill-chip--gap">{s}</span>)}
                        </div>
                      )}
                      {it.intelligence.whvTimeline && (it.intelligence.whvTimeline.urgencyLevel === "critical" || it.intelligence.whvTimeline.urgencyLevel === "soon" || it.intelligence.whvTimeline.urgencyLevel === "expired") && (
                        <p className={`intel-row intel-whv--${it.intelligence.whvTimeline.urgencyLevel}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                          <span>{it.intelligence.whvTimeline.note}</span>
                        </p>
                      )}
                      {it.intelligence.responseRate.factors.length > 0 && (
                        <p className="intel-factors">{it.intelligence.responseRate.factors.join(" · ")}</p>
                      )}
                    </div>
                  )}

                  <label className="field">
                    <span className="field-label">{t("new.to")}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={it.to}
                        onChange={(e) => {
                          update(it.id, { to: e.target.value, emailHealth: undefined, forceHealthBypass: false });
                          // Debounce health check on manual changes
                          const v = e.target.value;
                          setTimeout(() => checkItemHealthById(it.id, v), 800);
                        }}
                        placeholder="name@business.com"
                      />
                      {it.to && it.emailHealth && it.to.split(/[,;\s]+/).filter(Boolean).map((email, idx) => {
                        const h = it.emailHealth?.[email.trim()];
                        if (!h) return null;
                        const cls = h.status === "ok" || h.status === "ok-role" ? "health-dot health-dot--ok"
                          : h.status === "warn-role" ? "health-dot health-dot--warn"
                          : "health-dot health-dot--dead";
                        return <span key={idx} className={cls} title={h.hint || h.label} aria-hidden="true" />;
                      })}
                    </div>
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

                  <div className="row gap-4" style={{ alignItems: "center" }}>
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

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => regenerateWithDeepThinkingForItem(it.id)}
                      disabled={it.thinking || status === "sending"}
                      title={t("new.deepThink")}
                    >
                      {it.thinking ? (
                        <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      )}
                      {t("new.deepThink")}
                    </button>
                  </div>

                  <div className="glass card stack gap-2" style={{ padding: "var(--space-3)", background: "rgba(255,255,255,0.02)" }}>
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>{t("new.askTitle")}</span>
                      {(it.chatAnswer || it.chatError || it.chatLoading || it.chatShowCustomInput) && (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", fontSize: "var(--text-11)" }}
                          onClick={() => update(it.id, { chatAnswer: null, chatError: null, chatShowCustomInput: false, chatCustomQuestion: "", chatRevisedBody: null, chatRevisedSubject: null, chatRevisedCoverLetter: null })}>
                          {t("new.clear")}
                        </button>
                      )}
                    </div>

                    <div className="row gap-2 wrap">
                      {[t("new.askQ1"), t("new.askQ2"), t("new.askQ3")].map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: "var(--text-11)" }}
                          disabled={it.chatLoading}
                          onClick={() => askAboutItem(it.id, q)}
                        >
                          {q}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: "var(--text-11)", color: "var(--accent)" }}
                        disabled={it.chatLoading}
                        onClick={() => update(it.id, { chatShowCustomInput: true })}
                      >
                        + {t("new.askOther")}
                      </button>
                    </div>

                    {it.chatShowCustomInput && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          askAboutItem(it.id, it.chatCustomQuestion || "");
                        }}
                        className="row gap-2"
                      >
                        <input
                          className="input"
                          value={it.chatCustomQuestion || ""}
                          onChange={(e) => update(it.id, { chatCustomQuestion: e.target.value })}
                          placeholder={t("new.askPlaceholder")}
                          disabled={it.chatLoading}
                        />
                        <button type="submit" className="btn btn-sm" disabled={it.chatLoading || !it.chatCustomQuestion?.trim()}>
                          {t("new.askSend")}
                        </button>
                      </form>
                    )}

                    {it.chatLoading && <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("new.askThinking")}</span>}
                    {it.chatError && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{it.chatError}</span>}
                    {it.chatAnswer && !it.chatLoading && (
                      <p className="text-secondary" style={{ fontSize: "var(--text-13)", whiteSpace: "pre-wrap" }}>{it.chatAnswer}</p>
                    )}
                    {(it.chatRevisedBody || it.chatRevisedSubject || it.chatRevisedCoverLetter) && (
                      <button type="button" className="btn btn-sm" onClick={() => applyChatRevision(it.id)}>
                        {t("new.applyRevision")}
                      </button>
                    )}
                  </div>

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
                                {(COVER_LETTER_L10N[it.language || "en"] || COVER_LETTER_L10N.en).formatDate(new Date())}
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ color: "var(--content-primary)" }}>{it.company || "Company"}</strong>
                                <span style={{ color: "var(--content-secondary)" }}>
                                  {(COVER_LETTER_L10N[it.language || "en"] || COVER_LETTER_L10N.en).hiringTeam}
                                </span>
                              </div>

                              <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "6px", color: "var(--content-primary)", textAlign: "justify" }}>
                                {(it.coverLetterBody || "").split(/\n+/).filter(s => s.trim().length > 0).map((p, i) => (
                                  <p key={i} style={{ margin: 0 }}>{p}</p>
                                ))}
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

                  <div className="row gap-3" style={{ alignItems: "center" }}>
                    <button className="btn btn-primary btn-sm" data-loading={it.status === "sending"} onClick={() => sendOne(it.id)} disabled={it.status === "sending" || it.overLimit || !it.to.trim() || it.thinking}>
                      {t("new.send")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => regenerateWithDeepThinkingForItem(it.id)}
                      disabled={it.status === "sending" || it.thinking}
                      data-loading={it.thinking}
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
