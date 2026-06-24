"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useT } from "@/components/i18n";
import { APP_LANGS } from "@/lib/engine/template";

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
  applicationLanguage?: string;
};

export default function ProfileForm({
  mode,
  initial,
  cvFilename,
  gmailConnected,
  googleEnabled,
}: {
  mode: "onboarding" | "edit";
  initial: Initial;
  cvFilename: string | null;
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
  const [relocation, setRelocation] = useState(initial.relocation ?? true);
  const [shortBio, setShortBio] = useState(initial.shortBio || "");
  const [includeSignature, setIncludeSignature] = useState(initial.includeSignature ?? false);
  const [appLang, setAppLang] = useState(initial.applicationLanguage || "auto");
  const [cv, setCv] = useState(cvFilename);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function uploadCv(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/cv", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.uploadFailed"));
      setCv(d.cv.filename);
      setMsg({ kind: "ok", text: t("pf.cvUploaded") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setUploading(false);
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
          needsVisaSponsorship: needsVisa, relocation, shortBio, includeSignature, applicationLanguage: appLang,
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
          <span className="chip chip-ok">{t("pf.gmailConnected")}</span>
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

        <label className="field">
          <span className="field-label">{t("pf.shortBio")}</span>
          <textarea className="textarea" style={{ minHeight: 90 }} value={shortBio} onChange={(e) => setShortBio(e.target.value)} placeholder={t("pf.shortBioPh")} />
        </label>

        <label className="field" style={{ maxWidth: 280 }}>
          <span className="field-label">{t("new.applang")}</span>
          <select className="input" value={appLang} onChange={(e) => setAppLang(e.target.value)}>
            <option value="auto">{t("new.applang.auto")}</option>
            {APP_LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>

        <div className="row gap-6 wrap">
          <label className="toggle"><input type="checkbox" checked={needsVisa} onChange={(e) => setNeedsVisa(e.target.checked)} /> {t("pf.needsVisa")}</label>
          <label className="toggle"><input type="checkbox" checked={relocation} onChange={(e) => setRelocation(e.target.checked)} /> {t("pf.relocation")}</label>
          <label className="toggle"><input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} /> {t("pf.includeSignature")}</label>
        </div>
      </section>

      <section className="glass card stack gap-3">
        <h3>{t("pf.cv")}</h3>
        <div className="row gap-3 wrap">
          <label className="btn btn-sm" data-loading={uploading}>
            {uploading ? t("pf.uploading") : t("pf.uploadCv")}
            <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && uploadCv(e.target.files[0])} />
          </label>
          <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>
            {cv ? <>{t("pf.cvCurrent")}: <b>{cv}</b></> : t("pf.noCv")}
          </span>
        </div>
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
