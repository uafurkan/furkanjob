"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LangToggle, useT } from "@/components/i18n";

export default function OnboardingNav() {
  const { t } = useT();
  const handleSignOut = () => signOut({ callbackUrl: "/" });
  return (
    // Onboarding is a focused, one-time flow — top bar only, no nav dock.
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
  );
}
