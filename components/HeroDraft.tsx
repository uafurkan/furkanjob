"use client";
import { useEffect, useState } from "react";

// Types the draft body out, holds, erases, and loops — visualises "the draft writes itself".
// Honours prefers-reduced-motion by showing the full text statically.
export default function HeroDraft({ text }: { text: string }) {
  const [n, setN] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      return;
    }
    let i = 0;
    let phase: "typing" | "holding" | "erasing" = "typing";
    let hold = 0;
    const id = setInterval(() => {
      if (phase === "typing") {
        i++;
        if (i >= text.length) {
          i = text.length;
          phase = "holding";
        }
      } else if (phase === "holding") {
        hold++;
        if (hold > 30) {
          hold = 0;
          phase = "erasing";
        }
      } else {
        i -= 2;
        if (i <= 0) {
          i = 0;
          phase = "typing";
        }
      }
      setN(i);
    }, 45);
    return () => clearInterval(id);
  }, [text]);

  if (reduced) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, n)}
      <span className="type-caret" aria-hidden />
    </span>
  );
}
