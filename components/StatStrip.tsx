"use client";
import { useEffect, useRef, useState } from "react";

type Stat = { value: number; prefix?: string; suffix?: string; label: string };

// A row of stats that count up once when scrolled into view. Respects reduced-motion
// (shows final values immediately). No network, no deps — pure number animation.
export default function StatStrip({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const started = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setProgress(1);
      return;
    }
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setProgress(1);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const dur = 1100;
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / dur);
            // easeOutCubic
            setProgress(1 - Math.pow(1 - t, 3));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="stat-strip" ref={ref}>
      {stats.map((s, i) => (
        <div key={i} className="stat-strip-item">
          <span className="stat-strip-num">
            {s.prefix ?? ""}
            {Math.round(s.value * progress)}
            {s.suffix ?? ""}
          </span>
          <span className="stat-strip-label text-secondary">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
