"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";

const SHORTCUTS = [
  { key: "n", hint: "New application", hintTr: "Yeni başvuru", href: "/app/new" },
  { key: "h", hint: "Home", hintTr: "Ana sayfa", href: "/app/home" },
  { key: "p", hint: "Profile", hintTr: "Profil", href: "/app/profile" },
  { key: "b", hint: "Billing / Pro", hintTr: "Ücretlendirme", href: "/app/billing" },
];

export default function KeyboardShortcuts() {
  const router = useRouter();
  const { lang } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if ((e.target as HTMLElement).isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") { e.preventDefault(); setOpen((v) => !v); return; }
      if (e.key === "Escape") { setOpen(false); return; }

      const sc = SHORTCUTS.find((s) => s.key === e.key);
      if (sc) { e.preventDefault(); router.push(sc.href); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={() => setOpen(false)}>
      <div className="confirm-modal" style={{ maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <div className="stack gap-3" style={{ padding: "var(--space-2)" }}>
          <p className="confirm-title" style={{ marginBottom: 0 }}>
            {lang === "tr" ? "Klavye kısayolları" : "Keyboard shortcuts"}
          </p>
          <div className="stack gap-2">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="row gap-3" style={{ alignItems: "center", fontSize: "var(--text-14)" }}>
                <kbd style={{
                  fontFamily: "var(--font-mono)", background: "rgba(255,255,255,.08)",
                  border: "1px solid rgba(255,255,255,.12)", borderRadius: 6,
                  padding: "2px 8px", fontSize: "var(--text-13)", letterSpacing: ".05em",
                }}>{s.key}</kbd>
                <span className="text-secondary">{lang === "tr" ? s.hintTr : s.hint}</span>
              </div>
            ))}
            <div className="row gap-3" style={{ alignItems: "center", fontSize: "var(--text-14)" }}>
              <kbd style={{
                fontFamily: "var(--font-mono)", background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.12)", borderRadius: 6,
                padding: "2px 8px", fontSize: "var(--text-13)", letterSpacing: ".05em",
              }}>?</kbd>
              <span className="text-secondary">{lang === "tr" ? "Bu paneli aç/kapat" : "Toggle this panel"}</span>
            </div>
            <div className="row gap-3" style={{ alignItems: "center", fontSize: "var(--text-14)", opacity: .6 }}>
              <kbd style={{
                fontFamily: "var(--font-mono)", background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.12)", borderRadius: 6,
                padding: "2px 6px", fontSize: "var(--text-13)",
              }}>⌘↵</kbd>
              <span className="text-secondary">{lang === "tr" ? "Analiz / Gönder (Yeni başvuru sayfasında)" : "Analyze / Send (on New page)"}</span>
            </div>
          </div>
        </div>
        <div className="confirm-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            {lang === "tr" ? "Kapat" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
