"use client";
import { useState } from "react";
import { useT } from "@/components/i18n";

export type CclItem = { id: string; countryCode: string; filename: string; size: number };

const COUNTRIES: [string, string][] = [
  ["AU", "Australia"], ["CA", "Canada"], ["DE", "Germany"], ["DK", "Denmark"],
  ["ES", "Spain"], ["FI", "Finland"], ["FR", "France"], ["IE", "Ireland"],
  ["IT", "Italy"], ["NL", "Netherlands"], ["NZ", "New Zealand"], ["NO", "Norway"],
  ["PT", "Portugal"], ["SE", "Sweden"], ["CH", "Switzerland"], ["UK", "United Kingdom"],
  ["US", "United States"],
];

export default function CountryCoverLetterManager({ initial }: { initial: CclItem[] }) {
  const { t } = useT();
  const [items, setItems] = useState<CclItem[]>(initial);
  const [countryCode, setCountryCode] = useState("NZ");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const countryLabel = (code: string) => {
    const found = COUNTRIES.find(([c]) => c === code);
    return found ? found[1] : code;
  };

  async function upload(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("countryCode", countryCode);
      const r = await fetch("/api/cover-letter", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.uploadFailed"));
      const newItem: CclItem = { id: d.coverLetter.id, countryCode: d.coverLetter.countryCode, filename: d.coverLetter.filename, size: file.size };
      setItems((prev) => {
        const filtered = prev.filter((x) => x.countryCode !== newItem.countryCode);
        return [newItem, ...filtered];
      });
      setMsg({ kind: "ok", text: t("ccl.uploaded") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((d) => d.filter((x) => x.id !== id));
    try {
      const r = await fetch(`/api/cover-letter?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch {
      setItems(prev);
      setMsg({ kind: "err", text: t("pf.saveFailed") });
    }
  }

  return (
    <section className="glass card stack gap-4">
      <div className="stack gap-1">
        <h3>{t("ccl.title")}</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("ccl.note")}</p>
      </div>

      <div className="row gap-3 wrap" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ minWidth: 180 }}>
          <span className="field-label">{t("ccl.country")}</span>
          <select className="input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
        <label className="btn btn-sm" data-loading={uploading}>
          {uploading ? t("pf.uploading") : t("ccl.upload")}
          <input
            type="file"
            accept=".doc,.docx,application/pdf"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>

      {items.length > 0 && (
        <div className="stack gap-2">
          {items.map((d) => (
            <div key={d.id} className="doc-row">
              <span className="doc-type-chip">{countryLabel(d.countryCode)}</span>
              <span className="doc-name">{d.filename}</span>
              <button type="button" className="doc-del" onClick={() => remove(d.id)} aria-label={t("doc.remove")} title={t("doc.remove")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && <div className={`notice notice-${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}
