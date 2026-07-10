"use client";
import { useState } from "react";
import { useT } from "@/components/i18n";

type ParsedLinkedIn = {
  fullName: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  languages: string[];
  skills: string[];
  targetRoles: string[];
  shortBio: string | null;
  experienceYears: number | null;
  education: string | null;
};

type Props = {
  onApply: (parsed: ParsedLinkedIn) => void;
};

export default function LinkedInImport({ onApply }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedLinkedIn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function handleParse() {
    if (!text.trim() || text.trim().length < 50) return;
    setParsing(true);
    setError(null);
    setParsed(null);
    setApplied(false);
    try {
      const r = await fetch("/api/linkedin-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(t("pf.linkedin.failed"));
      } else {
        setParsed(d.parsed);
      }
    } catch {
      setError(t("pf.linkedin.failed"));
    } finally {
      setParsing(false);
    }
  }

  function handleApply() {
    if (!parsed) return;
    onApply(parsed);
    setApplied(true);
  }

  return (
    <div className="glass card stack gap-3">
      <div className="row gap-2" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-15)", fontWeight: 600 }}>{t("pf.linkedin.title")}</h3>
      </div>
      <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("pf.linkedin.note")}</p>

      <textarea
        className="input"
        style={{ minHeight: 100, resize: "vertical", fontSize: "var(--text-13)" }}
        placeholder={t("pf.linkedin.paste")}
        value={text}
        onChange={(e) => { setText(e.target.value); setParsed(null); setApplied(false); setError(null); }}
      />

      <div className="row gap-2">
        <button
          className="btn btn-sm btn-ghost"
          onClick={handleParse}
          disabled={parsing || text.trim().length < 50}
          data-loading={parsing}
        >
          {parsing ? t("pf.linkedin.parsing") : t("pf.linkedin.parse")}
        </button>
      </div>

      {error && <p style={{ fontSize: "var(--text-13)", color: "var(--signal-danger, #ef4444)", margin: 0 }}>{error}</p>}

      {parsed && !applied && (
        <div className="stack gap-2">
          <span className="field-label" style={{ margin: 0 }}>{t("pf.linkedin.preview")}</span>
          <div className="row gap-2 wrap">
            {parsed.fullName && <span className="chip">{parsed.fullName}</span>}
            {parsed.currentTitle && <span className="chip chip-accent">{parsed.currentTitle}</span>}
            {parsed.location && <span className="chip">{parsed.location}</span>}
            {parsed.languages.map((l) => <span key={l} className="chip chip-ok">{l}</span>)}
            {parsed.targetRoles.slice(0, 3).map((r) => <span key={r} className="chip">{r}</span>)}
            {typeof parsed.experienceYears === "number" && parsed.experienceYears > 0 && (
              <span className="chip">{parsed.experienceYears}y exp</span>
            )}
          </div>
          {parsed.shortBio && (
            <p style={{ fontSize: "var(--text-13)", color: "var(--text-secondary)", margin: 0, fontStyle: "italic" }}>
              "{parsed.shortBio.slice(0, 140)}{parsed.shortBio.length > 140 ? "…" : ""}"
            </p>
          )}
          <button className="btn btn-sm btn-primary" onClick={handleApply} style={{ alignSelf: "flex-start" }}>
            {t("pf.linkedin.apply")}
          </button>
        </div>
      )}

      {applied && (
        <p style={{ fontSize: "var(--text-13)", color: "var(--signal-success, #10b981)", margin: 0, fontWeight: 500 }}>
          ✓ {t("pf.linkedin.applied")}
        </p>
      )}
    </div>
  );
}
