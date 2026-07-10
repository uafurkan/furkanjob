"use client";
import { useState, useEffect, useRef } from "react";
import { getVisaTypesForCountry, type VisaTypeEntry } from "@/lib/engine/visa-types";
import { translate, type Lang } from "@/lib/i18n";

type Props = {
  countryCode: string;
  countryName: string;
  // The visa type that was used in the current draft (null = generic).
  currentVisaType: string | null;
  // Called when user wants to re-draft with a new visa type.
  onRedraft: (visaTypeId: string) => void;
  // Whether a re-draft is in progress.
  redrafting?: boolean;
  lang?: string;
};

export default function VisaTypeSelector({
  countryCode,
  countryName,
  currentVisaType,
  onRedraft,
  redrafting,
  lang = "en",
}: Props) {
  const l = (lang === "tr" ? "tr" : "en") as Lang;
  const t = (key: string) => translate(l, key);
  const types = getVisaTypesForCountry(countryCode);
  const [selected, setSelected] = useState<string | null>(currentVisaType);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const otherRef = useRef<HTMLInputElement>(null);

  // Load stored preference for this country on mount.
  useEffect(() => {
    fetch("/api/profile/visa-preferences")
      .then((r) => r.json())
      .then((d) => {
        const stored = d?.preferences?.[countryCode];
        if (stored) setRemembered(stored);
      })
      .catch(() => {});
  }, [countryCode]);

  // Sync selection when currentVisaType prop changes (after re-draft).
  useEffect(() => {
    if (currentVisaType) setSelected(currentVisaType);
  }, [currentVisaType]);

  if (!types) return null; // country not in our list

  const effectiveSelected = selected ?? remembered;

  function handleSelect(id: string) {
    if (id === "other") {
      setShowOther(true);
      setSelected("other");
      setTimeout(() => otherRef.current?.focus(), 50);
    } else {
      setShowOther(false);
      setSelected(id);
    }
  }

  function handleRedraft() {
    const visaId = showOther ? otherText.trim() : effectiveSelected;
    if (!visaId) return;
    onRedraft(visaId);
  }

  async function handleRemember() {
    const visaId = showOther ? otherText.trim() : effectiveSelected;
    if (!visaId || visaId === "other") return;
    setSaving(true);
    try {
      await fetch("/api/profile/visa-preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countryCode, visaTypeId: visaId }),
      });
      setRemembered(visaId);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } finally {
      setSaving(false);
    }
  }

  async function handleForget() {
    setSaving(true);
    try {
      await fetch("/api/profile/visa-preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countryCode, visaTypeId: null }),
      });
      setRemembered(null);
    } finally {
      setSaving(false);
    }
  }

  const visaId = showOther ? otherText.trim() : effectiveSelected;
  const isDirty = visaId && visaId !== currentVisaType;
  const isRemembered = remembered && remembered === effectiveSelected;

  return (
    <div className="visa-selector-panel">
      <div className="visa-selector-header">
        <span className="visa-selector-title">
          {t("visa.selector.title").replace("{country}", countryName)}
        </span>
        {currentVisaType && (
          <span className="visa-selector-using">
            {t("visa.selector.using").replace("{visaType}", currentVisaType)}
          </span>
        )}
      </div>

      <div className="visa-chip-row">
        {types.map((entry: VisaTypeEntry) => (
          <button
            key={entry.id}
            className={`visa-chip${effectiveSelected === entry.id && !showOther ? " visa-chip-active" : ""}`}
            title={entry.description}
            onClick={() => handleSelect(entry.id)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
        <button
          className={`visa-chip${showOther ? " visa-chip-active" : ""}`}
          onClick={() => handleSelect("other")}
          type="button"
        >
          {t("visa.selector.other")}
        </button>
      </div>

      {showOther && (
        <input
          ref={otherRef}
          className="visa-other-input"
          placeholder={t("visa.selector.other.placeholder")}
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && otherText.trim()) handleRedraft(); }}
        />
      )}

      <div className="visa-selector-actions">
        {isDirty && (
          <button
            className="btn btn-sm btn-primary visa-redraft-btn"
            onClick={handleRedraft}
            disabled={redrafting || (showOther && !otherText.trim())}
            type="button"
          >
            {redrafting ? "…" : t("visa.selector.redraft")}
          </button>
        )}

        {isRemembered ? (
          <div className="visa-remembered-row">
            <span className="visa-remembered-badge">✓ {t("visa.selector.remembered")}</span>
            <button
              className="visa-forget-btn"
              onClick={handleForget}
              disabled={saving}
              type="button"
            >
              {t("visa.selector.forget")}
            </button>
          </div>
        ) : (
          visaId && visaId !== "other" && (
            <button
              className={`visa-remember-btn${savedFlash ? " visa-saved-flash" : ""}`}
              onClick={handleRemember}
              disabled={saving}
              type="button"
            >
              {savedFlash
                ? t("visa.selector.saved").replace("{country}", countryName)
                : t("visa.selector.remember").replace("{country}", countryName)}
            </button>
          )
        )}
      </div>
    </div>
  );
}
