"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useT } from "@/components/i18n";

export default function HeaderAuthDropdown({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useT();

  if (!loggedIn) {
    return (
      <Link href="/signin" className="btn btn-sm">
        {t("common.signin")}
      </Link>
    );
  }

  return (
    <div className="header-dropdown-container">
      {/* Desktop Layout: Hover Dropdown */}
      <div className="header-dropdown-desktop">
        <Link href="/app/home" className="btn btn-sm btn-primary">
          {t("common.openApp")}
        </Link>
        <div className="header-dropdown-menu glass-strong">
          <button
            className="header-dropdown-item"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <IconLogout />
            <span>{t("nav.signout")}</span>
          </button>
        </div>
      </div>

      {/* Mobile Layout: Separate Button + Logout Icon */}
      <div className="header-dropdown-mobile">
        <Link href="/app/home" className="btn btn-sm btn-primary">
          {t("common.openApp")}
        </Link>
        <button
          className="btn btn-sm btn-ghost btn-icon-only"
          onClick={() => signOut({ callbackUrl: "/" })}
          title={t("nav.signout")}
          aria-label={t("nav.signout")}
        >
          <IconLogout />
        </button>
      </div>
    </div>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
