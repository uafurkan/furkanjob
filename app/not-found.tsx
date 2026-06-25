import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div className="glass card stack gap-4" style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: "var(--text-48)", fontWeight: 800, lineHeight: 1 }}>404</h1>
        <p className="text-secondary">This page doesn&apos;t exist or has moved.</p>
        <div className="row gap-3" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">Home</Link>
          <Link href="/app/new" className="btn">New application</Link>
        </div>
      </div>
    </main>
  );
}
