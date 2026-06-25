"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useT } from "@/components/i18n";
import { APP_LANGS } from "@/lib/engine/template";
import { VISA_TYPES, resolveVisaCountries, countryName } from "@/lib/engine/visa";

type Initial = {
  fullName?: string;
  contactEmail?: string;
  languages?: string[];
  targetRoles?: string[];
  targetCountries?: string[];
  needsVisaSponsorship?: boolean;
  relocation?: boolean;
  shortBio?: string;
  includeSignature?: boolean;
  digestOptOut?: boolean;
  applicationLanguage?: string;
  hasVisa?: boolean;
  visaType?: string;
  visaLabel?: string;
  visaCountries?: string[];
};

type ParsedCv = {
  fullName: string;
  summary: string;
  languages: string[];
  targetRoles: string[];
  yearsExperience: number;
};

type CvItem = { id: string; filename: string; isDefault: boolean };

export default function ProfileForm({
  mode,
  initial,
  cvFilename,
  initialCvs,
  gmailConnected,
  googleEnabled,
}: {
  mode: "onboarding" | "edit";
  initial: Initial;
  cvFilename: string | null;
  initialCvs?: CvItem[];
  gmailConnected: boolean;
  googleEnabled: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName || "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail || "");
  const [languages, setLanguages] = useState((initial.languages || []).join(", "));
  const [targetRoles, setTargetRoles] = useState((initial.targetRoles || []).join(", "));
  const [targetCountries, setTargetCountries] = useState((initial.targetCountries || []).join(", "));
  const [needsVisa, setNeedsVisa] = useState(initial.needsVisaSponsorship ?? true);
  const [hasVisa, setHasVisa] = useState(initial.hasVisa ?? false);
  const [visaType, setVisaType] = useState(initial.visaType || "");
  const [visaLabel, setVisaLabel] = useState(initial.visaLabel || "");
  const [visaCountries, setVisaCountries] = useState<string[]>(initial.visaCountries || []);
  const [visaUploading, setVisaUploading] = useState(false);
  const [visaDoc, setVisaDoc] = useState<string | null>(null);
  const [relocation, setRelocation] = useState(initial.relocation ?? true);
  const [shortBio, setShortBio] = useState(initial.shortBio || "");
  const [includeSignature, setIncludeSignature] = useState(initial.includeSignature ?? false);
  const [digestOptOut, setDigestOptOut] = useState(initial.digestOptOut ?? false);
  const [appLang, setAppLang] = useState(initial.applicationLanguage || "auto");
  const [cvs, setCvs] = useState<CvItem[]>(initialCvs || (cvFilename ? [{ id: "", filename: cvFilename, isDefault: true }] : []));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [parsedCv, setParsedCv] = useState<ParsedCv | null>(null);
  const [showParseConfirm, setShowParseConfirm] = useState(false);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function refreshCvs() {
    try {
      const r = await fetch("/api/cv");
      if (r.ok) { const d = await r.json(); setCvs(d.cvs || []); }
    } catch {}
  }

  async function uploadCv(file: File) {
    setUploading(true);
    setMsg(null);
    setParsedCv(null);
    setShowParseConfirm(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/cv", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.uploadFailed"));
      await refreshCvs();

      // Parse CV to extract profile data
      const parseRes = await fetch("/api/cv/parse", { method: "POST", body: fd });
      if (parseRes.ok) {
        const parsed = await parseRes.json();
        setParsedCv(parsed);
        setShowParseConfirm(true);
        setMsg({ kind: "info", text: t("pf.cvParsed") });
      } else {
        setMsg({ kind: "ok", text: t("pf.cvUploaded") });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function setDefaultCv(id: string) {
    setCvs((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
    try { await fetch(`/api/cv?id=${encodeURIComponent(id)}`, { method: "PATCH" }); } catch { await refreshCvs(); }
  }
  async function removeCv(id: string) {
    const prev = cvs;
    setCvs((c) => c.filter((x) => x.id !== id));
    try {
      const r = await fetch(`/api/cv?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      await refreshCvs();
    } catch { setCvs(prev); }
  }

  function applyParsedData() {
    if (!parsedCv) return;
    if (parsedCv.fullName) setFullName(parsedCv.fullName);
    if (parsedCv.summary) setShortBio(parsedCv.summary);
    if (parsedCv.languages.length) setLanguages(parsedCv.languages.join(", "));
    if (parsedCv.targetRoles.length) setTargetRoles(parsedCv.targetRoles.join(", "));
    setParsedCv(null);
    setShowParseConfirm(false);
    setMsg({ kind: "ok", text: t("pf.profileUpdated") });
  }

  function selectVisaType(typeId: string) {
    setVisaType(typeId);
    const preset = VISA_TYPES.find((v) => v.id === typeId);
    if (preset && typeId !== "custom") {
      setVisaCountries(preset.countries.slice());
      if (!visaLabel.trim()) setVisaLabel(preset.label);
    }
  }

  function toggleVisaCountry(code: string) {
    setVisaCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function uploadVisa(file: File) {
    setVisaUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/visa", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.uploadFailed"));
      setVisaDoc(d.document?.filename || file.name);
      if (d.suggestion) {
        if (d.suggestion.visaType) setVisaType(d.suggestion.visaType);
        if (d.suggestion.label) setVisaLabel(d.suggestion.label);
        if (Array.isArray(d.suggestion.countries) && d.suggestion.countries.length) {
          setVisaCountries(d.suggestion.countries);
        }
        setMsg({ kind: "info", text: t("pf.visaSuggested") });
      } else {
        setMsg({ kind: "ok", text: t("pf.visaUploaded") });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setVisaUploading(false);
    }
  }

  async function save() {
    if (!fullName.trim()) return setMsg({ kind: "err", text: t("pf.nameRequired") });
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName, contactEmail,
          languages: split(languages), targetRoles: split(targetRoles), targetCountries: split(targetCountries),
          needsVisaSponsorship: needsVisa, relocation, shortBio, includeSignature, digestOptOut,
          applicationLanguage: appLang, hasVisa, visaType, visaLabel, visaCountries,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.saveFailed"));
      if (mode === "onboarding") router.push("/app/new");
      else { setMsg({ kind: "ok", text: t("pf.saved") }); router.refresh(); }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack gap-6">
      <section className="glass card stack gap-4">
        <h3>{t("pf.account")}</h3>
        {gmailConnected ? (
          <div className="account-connected">
            <span className="account-badge" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
                <path d="M3.5 7l8.5 6 8.5-6" />
              </svg>
            </span>
            <div className="account-info">
              <span className="account-status">
                <span className="account-dot" /> {t("pf.gmailConnected.title")}
              </span>
              <span className="account-sub">{t("pf.gmailConnected.note")}</span>
            </div>
          </div>
        ) : googleEnabled ? (
          <div className="stack gap-2">
            <button className="btn" onClick={() => signIn("google", { callbackUrl: mode === "onboarding" ? "/onboarding" : "/app/profile" })}>
              {t("pf.connectGmail")}
            </button>
            <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("pf.scopeNote")} {t("pf.connectNote")}</span>
          </div>
        ) : (
          <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{t("pf.noGoogle")}</span>
        )}
      </section>

      <section className="glass card stack gap-4">
        <h3>{t("pf.profile")}</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t("pf.fullName")}</span>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t("pf.contactEmail")}</span>
            <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field-label">{t("pf.languages")}</span>
          <input className="input" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English (B2), Spanish (A2)…" />
        </label>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t("pf.targetRoles")}</span>
            <input className="input" value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} placeholder="Front Desk, Kitchen Serving" />
          </label>
          <label className="field">
            <span className="field-label">{t("pf.targetCountries")}</span>
            <input className="input" value={targetCountries} onChange={(e) => setTargetCountries(e.target.value)} placeholder="New Zealand, Australia, United States" />
          </label>
        </div>

        {hasVisa && (() => {
          const have = new Set(split(targetCountries).map((s) => s.toLowerCase()));
          const sugg = visaCountries.map((c) => countryName(c)).filter((n) => !have.has(n.toLowerCase()));
          if (sugg.length === 0 || sugg.length > 6) return null;
          return (
            <div className="row gap-2 wrap" style={{ marginTop: "calc(-1 * var(--space-2))" }}>
              <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("pf.visaSuggest")}</span>
              {sugg.map((n) => <span key={n} className="chip">{n}</span>)}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setTargetCountries([...new Set([...split(targetCountries), ...sugg])].join(", "))}
              >
                {t("pf.visaSuggestAdd")}
              </button>
            </div>
          );
        })()}

        <label className="field">
          <span className="field-label">{t("pf.shortBio")}</span>
          <textarea className="textarea" style={{ minHeight: 90 }} value={shortBio} onChange={(e) => setShortBio(e.target.value)} placeholder={t("pf.shortBioPh")} />
        </label>

        <div className="row gap-6 wrap">
          <label className="toggle"><input type="checkbox" checked={needsVisa} onChange={(e) => setNeedsVisa(e.target.checked)} /> {t("pf.needsVisa")}</label>
          <label className="toggle"><input type="checkbox" checked={hasVisa} onChange={(e) => setHasVisa(e.target.checked)} /> {t("pf.hasVisa")}</label>
          <label className="toggle"><input type="checkbox" checked={relocation} onChange={(e) => setRelocation(e.target.checked)} /> {t("pf.relocation")}</label>
          <label className="toggle"><input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} /> {t("pf.includeSignature")}</label>
          <label className="toggle"><input type="checkbox" checked={digestOptOut} onChange={(e) => setDigestOptOut(e.target.checked)} /> {t("pf.digestOptOut")}</label>
        </div>

        {hasVisa && (
          <div className="visa-panel stack gap-4">
            <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("pf.visaNote")}</span>

            <div className="form-grid">
              <label className="field">
                <span className="field-label">{t("pf.visaType")}</span>
                <select className="input" value={visaType} onChange={(e) => selectVisaType(e.target.value)}>
                  <option value="">{t("pf.visaTypePick")}</option>
                  {VISA_TYPES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">{t("pf.visaLabel")}</span>
                <input className="input" value={visaLabel} onChange={(e) => setVisaLabel(e.target.value)} placeholder="Spain work and residence permit" />
              </label>
            </div>

            <div className="stack gap-2">
              <span className="field-label">{t("pf.visaCountries")}</span>
              {visaCountries.length ? (
                <div className="row gap-2 wrap">
                  {visaCountries.map((c) => (
                    <button type="button" key={c} className="chip chip-accent visa-chip" onClick={() => toggleVisaCountry(c)} title={t("pf.cancel")}>
                      {countryName(c)} <span aria-hidden>✕</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("pf.visaCountriesEmpty")}</span>
              )}
            </div>

            <div className="row gap-3 wrap">
              <label className="btn btn-sm" data-loading={visaUploading}>
                {visaUploading ? t("pf.uploading") : t("pf.visaUpload")}
                <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => e.target.files?.[0] && uploadVisa(e.target.files[0])} />
              </label>
              {visaDoc && <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{t("pf.cvCurrent")}: <b>{visaDoc}</b></span>}
              <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("pf.visaUploadNote")}</span>
            </div>
          </div>
        )}
      </section>

      <section className="glass card stack gap-3">
        <div className="stack gap-1">
          <h3>{t("pf.cv")}</h3>
          <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("pf.cvNote")}</p>
        </div>

        {cvs.length > 0 && (
          <div className="stack gap-2">
            {cvs.map((c) => (
              <div key={c.id || c.filename} className="doc-row">
                {c.isDefault ? (
                  <span className="doc-type-chip">{t("pf.cvDefault")}</span>
                ) : c.id ? (
                  <button type="button" className="chip" style={{ cursor: "pointer" }} onClick={() => setDefaultCv(c.id)}>
                    {t("pf.cvSetDefault")}
                  </button>
                ) : null}
                <span className="doc-name">{c.filename}</span>
                {c.id && (
                  <button type="button" className="doc-del" onClick={() => removeCv(c.id)} aria-label={t("doc.remove")} title={t("doc.remove")}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="row gap-3 wrap">
          <label className="btn btn-sm" data-loading={uploading}>
            {uploading ? t("pf.uploading") : cvs.length ? t("pf.addCv") : t("pf.uploadCv")}
            <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && uploadCv(e.target.files[0])} />
          </label>
          {cvs.length === 0 && <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{t("pf.noCv")}</span>}
        </div>
      </section>

      {showParseConfirm && parsedCv && (
        <section className="glass card stack gap-3" style={{ borderColor: "var(--signal-success, #5FD0A6)" }}>
          <h3>{t("pf.cvParsedTitle")}</h3>
          <p className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{t("pf.cvParsedNote")}</p>

          {parsedCv.fullName && <div><strong>{t("pf.fullName")}:</strong> {parsedCv.fullName}</div>}
          {parsedCv.summary && <div><strong>{t("pf.shortBio")}:</strong> {parsedCv.summary}</div>}
          {parsedCv.languages.length > 0 && <div><strong>{t("pf.languages")}:</strong> {parsedCv.languages.join(", ")}</div>}
          {parsedCv.targetRoles.length > 0 && <div><strong>{t("pf.targetRoles")}:</strong> {parsedCv.targetRoles.join(", ")}</div>}
          {parsedCv.yearsExperience > 0 && <div><strong>{t("pf.experience")}:</strong> {parsedCv.yearsExperience} years</div>}

          <div className="row gap-3">
            <button className="btn btn-sm" onClick={() => setShowParseConfirm(false)}>{t("pf.cancel")}</button>
            <button className="btn btn-sm btn-primary" onClick={applyParsedData}>{t("pf.applyParsed")}</button>
          </div>
        </section>
      )}

      <section style={{ maxWidth: 280 }}>
        <label className="field">
          <span className="field-label">{t("new.applang")}</span>
          <select className="input" value={appLang} onChange={(e) => setAppLang(e.target.value)}>
            <option value="auto">{t("new.applang.auto")}</option>
            {APP_LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="row gap-3 wrap">
        <button className="btn btn-primary" data-loading={saving} onClick={save} disabled={saving}>
          {saving ? t("pf.saving") : mode === "onboarding" ? t("pf.saveOnboarding") : t("pf.saveEdit")}
        </button>
      </div>

      {msg && <div className={`notice notice-${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}
