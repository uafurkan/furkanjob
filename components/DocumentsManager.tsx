"use client";
import { useState } from "react";
import { useT } from "@/components/i18n";

export type DocItem = { id: string; type: string; filename: string; size: number };

const DOC_TYPES = ["diploma", "certificate", "experience", "other"] as const;

export default function DocumentsManager({ initial }: { initial: DocItem[] }) {
  const { t } = useT();
  const [docs, setDocs] = useState<DocItem[]>(initial);
  const [type, setType] = useState<string>("diploma");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const typeLabel = (ty: string) => t(`doc.type.${ty}`);

  async function upload(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("pf.uploadFailed"));
      setDocs((prev) => [d.document, ...prev]);
      setMsg({ kind: "ok", text: t("doc.uploaded") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== id));
    try {
      const r = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch {
      setDocs(prev); // revert on failure
      setMsg({ kind: "err", text: t("pf.saveFailed") });
    }
  }

  return (
    <section className="glass card stack gap-4">
      <div className="stack gap-1">
        <h3>{t("doc.title")}</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("doc.note")}</p>
      </div>

      <div className="row gap-3 wrap" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ minWidth: 180 }}>
          <span className="field-label">{t("doc.type")}</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {DOC_TYPES.map((ty) => (
              <option key={ty} value={ty}>{typeLabel(ty)}</option>
            ))}
          </select>
        </label>
        <label className="btn btn-sm" data-loading={uploading}>
          {uploading ? t("pf.uploading") : t("doc.upload")}
          <input
            type="file"
            accept="application/pdf,image/*,.doc,.docx"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>

      {docs.length > 0 && (
        <div className="stack gap-2">
          {docs.map((d) => (
            <div key={d.id} className="doc-row">
              <span className="doc-type-chip">{typeLabel(d.type)}</span>
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
