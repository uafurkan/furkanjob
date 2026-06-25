"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="container" style={{ minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div className="glass card stack gap-4" style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: "var(--text-28)" }}>Something went wrong</h1>
        <p className="text-secondary">An unexpected error occurred. You can try again or head back home.</p>
        <div className="row gap-3" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn">Home</Link>
        </div>
      </div>
    </main>
  );
}
