"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LangToggle, useT } from "@/components/i18n";

export default function OnboardingNav() {
  const { t } = useT();
  return (
    <>
      <header className="topbar glass" role="banner">
        <Link href="/" className="brand" aria-label="paply">
          <span className="brand-dot" /> paply
        </Link>
        <div className="topbar-right">
          <LangToggle />
          <button className="btn btn-sm btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            {t("nav.signout")}
          </button>
        </div>
      </header>
    </>
  );
}
