"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useT, LangToggle } from "@/components/i18n";
import AppGuide from "@/components/AppGuide";

const MAIN_TABS = [
  { href: "/app/home", key: "nav.home", icon: IconHome },
  { href: "/app/new", key: "nav.new", icon: IconPlus },
  { href: "/app/analytics", key: "nav.analytics", icon: IconChart },
  { href: "/app/profile", key: "nav.profile", icon: IconUser },
  { href: "/app/pmail", key: "nav.pmail", icon: IconMail },
];
const PRO_TAB = { href: "/app/billing", key: "nav.pro", icon: IconSpark };

// Dock reveal logic (same on web + mobile):
//   • scroll UP  → reveal, then auto-hide after 3s
//   • scroll DOWN → hide immediately
//   • idle/stopped → does NOT reveal (stays as-is)
//   • near the very top of the page → always visible (nothing to hide behind,
//     and short / non-scrolling pages would otherwise never show the nav)
const NEAR_TOP = 80;
const REVEAL_MS = 3000;
function useDockAutoHide() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let hideTimer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= NEAR_TOP) {                 // at the top → always visible
        clearTimeout(hideTimer);
        setHidden(false);
      } else if (y < lastY - 4) {          // decisive scroll up → reveal for 3s
        setHidden(false);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (window.scrollY > NEAR_TOP) setHidden(true);
        }, REVEAL_MS);
      } else if (y > lastY + 4) {          // scroll down → hide now
        clearTimeout(hideTimer);
        setHidden(true);
      }
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(hideTimer); };
  }, []);
  return hidden;
}

export default function AppNav({ name, plan, isAdmin }: { name?: string | null; plan?: string; isAdmin?: boolean }) {
  const path = usePathname();
  const { t } = useT();
  const dockHidden = useDockAutoHide();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      {/* Top bar — brand + account only; navigation lives in the dock below. */}
      <header className="topbar glass" role="banner">
        <Link href="/app/home" className="brand" aria-label="paply">
          <span className="brand-dot" /> paply
        </Link>
        <div className="topbar-right">
          {isAdmin && <Link href="/admin" className="chip" style={{ textDecoration: "none" }}>Admin</Link>}
          {plan && <span className={`chip${plan === "pro" ? " chip-accent" : ""}`}>{plan === "pro" ? t("plan.pro") : t("plan.free")}</span>}
          <button className="btn btn-sm btn-ghost btn-icon-only" onClick={() => setGuideOpen(true)} title={t("guide.open")} aria-label={t("guide.open")}>
            <IconHelp />
          </button>
          <LangToggle />
          <button className="btn btn-sm btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            {t("nav.signout")}
          </button>
        </div>
      </header>
      <AppGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Floating dock (macOS-style) — primary navigation on every viewport. */}
      <nav className={`tabbar${dockHidden ? " dock-hidden" : ""}`} aria-label="Navigation">
        <div className="tab-pill">
          {MAIN_TABS.map((tab) => (
            <Link key={tab.href} href={tab.href} className={`tab${isActive(tab.href) ? " active" : ""}`}>
              <span className="tab-ico"><tab.icon /></span>
              <span className="tab-label">{t(tab.key)}</span>
            </Link>
          ))}
        </div>
        <Link href={PRO_TAB.href} className={`tab-circle${isActive(PRO_TAB.href) ? " active" : ""}`}>
          <span className="tab-ico"><PRO_TAB.icon /></span>
          <span className="tab-label" style={{ fontSize: 10 }}>{t(PRO_TAB.key)}</span>
        </Link>
      </nav>
    </>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" />
      <circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none" />
    </svg>
  );
}
