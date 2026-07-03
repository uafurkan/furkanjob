"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminUserRow({
  id, email, name, plan, createdAt, applications, gmailAddress,
}: {
  id: string; email: string; name?: string | null; plan: string; createdAt: string; applications: number; gmailAddress?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(plan);
  const router = useRouter();
  const isPro = cur === "pro" || cur === "team";

  async function setPlan(next: "free" | "pro") {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: id, plan: next }),
      });
      if (r.ok) { setCur(next); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass card app-row">
      <div className="stack gap-1 grow">
        <div className="row gap-2 wrap">
          <b>{name || email.split("@")[0]}</b>
          <span className={`chip ${isPro ? "chip-accent" : ""}`}>{cur}</span>
        </div>
        <span className="mono text-secondary" style={{ fontSize: "var(--text-12)" }}>
          {email} · {applications} apps · {new Date(createdAt).toLocaleDateString("en-US")}
        </span>
        {gmailAddress && (
          <span className="mono" style={{ fontSize: "var(--text-12)", color: "var(--color-ok, #4ade80)" }}>
            ✓ Gmail: {gmailAddress}
          </span>
        )}
      </div>
      <button className="btn btn-sm" data-loading={busy} onClick={() => setPlan(isPro ? "free" : "pro")} disabled={busy}>
        {isPro ? "Downgrade" : "Make Pro"}
      </button>
    </div>
  );
}
