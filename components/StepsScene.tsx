"use client";
import { useEffect, useRef, useState } from "react";
import HeroDraft from "@/components/HeroDraft";

type Step = { n: string; title: string; d: string };
type Labels = {
  pasted: string;
  found: string;
  application: string;
  sent: string;
};

// Sticky "scrollytelling" version of the three steps: as the user scrolls past each
// step on the left, the single glass mockup on the right morphs paste → draft → sent.
// Mirrors the hero's paper-plane metaphor down the page. Falls back to a plain stack
// under prefers-reduced-motion or on narrow screens (CSS turns sticky off).
export default function StepsScene({
  steps,
  labels,
  sampleText,
  sampleEmail,
  draftText,
}: {
  steps: Step[];
  labels: Labels;
  sampleText: string;
  sampleEmail: string;
  draftText: string;
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLDivElement[];
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      // Trigger when a step crosses the vertical middle of the viewport.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <div className="steps-sticky">
      <div className="steps-sticky-track">
        {steps.map((s, i) => (
          <div
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            data-idx={i}
            className={`steps-sticky-step${i === active ? " is-active" : ""}`}
          >
            <span className="step-num">{s.n}</span>
            <h3 style={{ fontSize: "var(--text-18)", margin: 0 }}>{s.title}</h3>
            <p className="text-secondary" style={{ margin: 0 }}>{s.d}</p>
          </div>
        ))}
      </div>

      <div className="steps-sticky-visual" aria-hidden="true">
        <div className="glass card steps-stage">
          {/* Frame 0 — pasted raw text */}
          <div className={`steps-frame${active === 0 ? " is-on" : ""}`}>
            <div className="scene-tag">{labels.pasted}</div>
            <p className="steps-frame-body">{sampleText}</p>
          </div>

          {/* Frame 1 — found email + drafting */}
          <div className={`steps-frame${active === 1 ? " is-on" : ""}`}>
            <div className="scene-tag">{labels.application}</div>
            <span className="chip chip-ok steps-email">✓ {labels.found}: {sampleEmail}</span>
            <p className="steps-frame-body text-secondary">
              {active === 1 ? <HeroDraft text={draftText} /> : draftText}
            </p>
          </div>

          {/* Frame 2 — sent */}
          <div className={`steps-frame steps-frame-sent${active === 2 ? " is-on" : ""}`}>
            <svg viewBox="0 0 48 48" width="48" height="48" className="steps-sent-mark">
              <circle cx="24" cy="24" r="22" fill="none" stroke="#5FD0A6" strokeWidth="2.5" />
              <path d="M15,24.5 L21,30.5 L34,17" fill="none" stroke="#5FD0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <b>{labels.sent}</b>
            <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{sampleEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
