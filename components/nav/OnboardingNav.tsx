"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LangToggle, useT } from "@/components/i18n";

export default function OnboardingNav() {
  const { t } = useT();
  const handleSignOut = () => signOut({ callbackUrl: "/" });
  return (
    <>
      {/* desktop */}
      <header className="topbar glass" role="banner">
        <Link href="/" className="brand" aria-label="paply">
          <span className="brand-dot" /> paply
        </Link>
        <div className="topbar-right">
          <LangToggle />
          <button className="btn btn-sm btn-ghost" onClick={handleSignOut}>
            {t("nav.signout")}
          </button>
        </div>
      </header>

      {/* mobile bottom bar (tabbar hides topbar on mobile) */}
      <nav className="tabbar" aria-label="Setup">
        <div className="tab-pill" style={{ gap: "var(--space-4)", padding: "8px 20px" }}>
          <Link href="/" className="brand" style={{ fontSize: "var(--text-14)" }}>
            <span className="brand-dot" /> paply
          </Link>
          <LangToggle />
          <button className="btn btn-sm btn-ghost" onClick={handleSignOut} style={{ fontSize: "var(--text-12)" }}>
            {t("nav.signout")}
          </button>
        </div>
      </nav>
    </>
  );
}
