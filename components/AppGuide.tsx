"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";

const GUIDE_KEY = "paply:guide:seen";

// ── SVG icon set (no emojis) ──────────────────────────────────────────────────

function IcoMail() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <polyline points="2,4 12,13 22,4"/>
    </svg>
  );
}
function IcoGlobe() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>
    </svg>
  );
}
function IcoClip() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function IcoSend() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
function IcoUser() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>
    </svg>
  );
}

// ── Step mockup components ────────────────────────────────────────────────────

function WelcomeMock() {
  const CHIPS = [
    { Icon: IcoMail,  label: "Email found"    },
    { Icon: IcoGlobe, label: "Visa language"  },
    { Icon: IcoClip,  label: "CV attached"    },
  ];
  return (
    <div className="gm gm-welcome">
      <div className="gm-logo">
        <span className="gm-pulse-dot" />
        <span className="gm-wordmark">paply</span>
      </div>
      <div className="gm-feat-chips">
        {CHIPS.map(({ Icon, label }, i) => (
          <span key={label} className="chip gm-chip" style={{ animationDelay: `${i * 280 + 300}ms` }}>
            <Icon />{label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PasteMock() {
  return (
    <div className="gm gm-paste">
      <div className="gm-fake-area">
        <div className="gm-ta-header">
          {[0, 1, 2].map((i) => <span key={i} className="gm-ta-dot" />)}
        </div>
        <div className="gm-ta-body">
          <span className="gm-tl gm-tl-1">Dux Dine Restaurant — Wellington NZ</span>
          <span className="gm-tl gm-tl-2">We're looking for experienced waitstaff…</span>
          <span className="gm-tl gm-tl-3">careers@duxdine.co.nz</span>
        </div>
      </div>
      <div className="gm-paste-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
        </svg>
        <span>AI agent analyzing…</span>
      </div>
    </div>
  );
}

function RolesMock() {
  return (
    <div className="gm gm-roles">
      {[
        { label: "Waiter",       ok: true,  note: "Best fit",    delay: 80  },
        { label: "Kitchen Hand", ok: true,  note: "",            delay: 320 },
        { label: "Night Audit",  ok: false, note: "lodging role", delay: 580 },
      ].map((r) => (
        <div key={r.label} className={`gm-role-row${r.ok ? " gm-role-ok" : " gm-role-drop"}`} style={{ animationDelay: `${r.delay}ms` }}>
          <span className="gm-role-icon">{r.ok ? <IcoCheck /> : <IcoX />}</span>
          <span className="gm-role-name">{r.label}</span>
          {r.note && <span className="gm-role-note">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

function DraftMock() {
  return (
    <div className="gm gm-draft">
      <div className="gm-score-row">
        <span className="gm-score-num">82</span>
        <div className="gm-score-track">
          <div className="gm-score-fill" />
        </div>
        <span className="gm-score-tag">Good fit</span>
      </div>
      <div className="gm-email-lines">
        {[100, 92, 85, 70, 95, 55].map((w, i) => (
          <div key={i} className="gm-email-line" style={{ width: `${w}%`, animationDelay: `${i * 90 + 700}ms` }} />
        ))}
      </div>
    </div>
  );
}

function AskMock() {
  return (
    <div className="gm gm-ask">
      <div className="gm-ask-chips">
        {[
          "Is the tone right for this role?",
          "Should I mention visa status earlier?",
          "Is this email too long?",
        ].map((q, i) => (
          <button key={q} className="btn btn-sm gm-ask-q" style={{ animationDelay: `${i * 220 + 100}ms` }}>
            {q}
          </button>
        ))}
      </div>
      <div className="gm-ask-answer">
        The tone is warm and professional — perfect for hospitality. Moving the visa mention to the opening paragraph would make the requirement clear from the start.
      </div>
    </div>
  );
}

function SendMock() {
  return (
    <div className="gm gm-send">
      <div className="gm-envelope">✉️</div>
      <div className="gm-send-meta">
        {([
          [<IcoMail key="m" />, "careers@duxdine.co.nz"],
          [<IcoUser key="u" />, "you@gmail.com"],
          [<IcoClip key="c" />, "YourCV.pdf"],
        ] as [React.ReactNode, string][]).map(([icon, v], i) => (
          <div key={i} className="gm-send-row">
            <span className="gm-send-key">{icon}</span>
            <span className="gm-send-val">{v}</span>
          </div>
        ))}
      </div>
      <div className="gm-sent-badge">
        <IcoCheck /> Sent
      </div>
    </div>
  );
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "welcome", Mockup: WelcomeMock, titleKey: "guide.s0.title", subKey: "guide.s0.sub" },
  { id: "paste",   Mockup: PasteMock,   titleKey: "guide.s1.title", subKey: "guide.s1.sub" },
  { id: "roles",   Mockup: RolesMock,   titleKey: "guide.s2.title", subKey: "guide.s2.sub" },
  { id: "draft",   Mockup: DraftMock,   titleKey: "guide.s3.title", subKey: "guide.s3.sub" },
  { id: "askai",   Mockup: AskMock,     titleKey: "guide.s4.title", subKey: "guide.s4.sub" },
  { id: "send",    Mockup: SendMock,    titleKey: "guide.s5.title", subKey: "guide.s5.sub" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

// React import for JSX type
import type React from "react";

export default function AppGuide({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const { t } = useT();

  useEffect(() => {
    try {
      if (!localStorage.getItem(GUIDE_KEY)) setVisible(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) { setStep(0); setVisible(true); }
  }, [open]);

  function dismiss() {
    try { localStorage.setItem(GUIDE_KEY, "1"); } catch {}
    setVisible(false);
    onClose?.();
  }

  if (!visible) return null;

  const { Mockup, titleKey, subKey } = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="guide-backdrop"
      role="presentation"
      onKeyDown={(e) => e.key === "Escape" && dismiss()}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div className="guide-card glass glass-strong" role="dialog" aria-modal="true">
        {/* Header row: drag handle (centred, mobile only) + skip button (right) */}
        <div className="guide-card-header">
          <div className="guide-handle" aria-hidden="true" />
          <button className="guide-skip btn btn-ghost btn-sm" onClick={dismiss}>
            {t("guide.skip")}
          </button>
        </div>

        {/* Step content — keyed so every step animates fresh.
            guide-footer is INSIDE here; margin-top:auto pins it to the bottom. */}
        <div className="guide-step" key={step}>
          <div className="guide-mockup">
            <Mockup />
          </div>
          <div className="guide-body">
            <p className="guide-eyebrow">{step + 1} / {STEPS.length}</p>
            <h2 className="guide-title">{t(titleKey)}</h2>
            <p className="guide-sub">{t(subKey)}</p>
          </div>

          <div className="guide-footer">
            <div className="guide-dots" aria-hidden="true">
              {STEPS.map((_, i) => (
                <button key={i} className={`guide-dot${i === step ? " active" : ""}`} onClick={() => setStep(i)} />
              ))}
            </div>
            <div className="guide-nav">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setStep((s) => s - 1)}
                style={{ visibility: step === 0 ? "hidden" : "visible" }}
              >
                {t("guide.prev")}
              </button>
              <button
                className={`btn btn-sm${isLast ? " btn-primary" : ""}`}
                onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
              >
                {isLast ? t("guide.done") : t("guide.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
