"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useT } from "@/components/i18n";

export default function AccountData() {
  const { t } = useT();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportData() {
    setBusy("export");
    setMsg(null);
    try {
      const r = await fetch("/api/account");
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "paply-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg(t("acct.exportFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      const r = await fetch("/api/account", { method: "DELETE" });
      if (!r.ok) throw new Error();
      await signOut({ callbackUrl: "/" });
    } catch {
      setMsg(t("acct.deleteFailed"));
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <section className="glass card stack gap-3">
      <div className="stack gap-1">
        <h3>{t("acct.title")}</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("acct.note")}</p>
      </div>

      <div className="row gap-3 wrap">
        <button className="btn btn-sm" data-loading={busy === "export"} onClick={exportData} disabled={busy !== null}>
          {t("acct.export")}
        </button>
        {!confirming ? (
          <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)} disabled={busy !== null}>
            {t("acct.delete")}
          </button>
        ) : (
          <div className="row gap-2 wrap">
            <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{t("acct.deleteConfirm")}</span>
            <button className="btn btn-sm btn-danger" data-loading={busy === "delete"} onClick={deleteAccount} disabled={busy !== null}>
              {t("acct.deleteYes")}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
              {t("acct.cancel")}
            </button>
          </div>
        )}
      </div>

      {msg && <div className="notice notice-err">{msg}</div>}
    </section>
  );
}
