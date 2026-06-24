"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useT, LangToggle } from "@/components/i18n";

const TABS = [
  { href: "/app/new", key: "nav.new", icon: IconPlus },
  { href: "/app/applications", key: "nav.applications", icon: IconList },
  { href: "/app/profile", key: "nav.profile", icon: IconUser },
  { href: "/app/billing", key: "nav.pro", icon: IconSpark },
];

export default function AppNav({ name, plan, isAdmin }: { name?: string | null; plan?: string; isAdmin?: boolean }) {
  const path = usePathname();
  const { t } = useT();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      {/* desktop top bar */}
      <header className="topbar glass" role="banner">
        <Link href="/app/new" className="brand" aria-label="applythatforme">
          <span className="brand-dot" /> applythatforme
        </Link>
        <nav className="topnav" aria-label="Menu">
          {TABS.map((tab) => (
            <Link key={tab.href} href={tab.href} className={`topnav-item${isActive(tab.href) ? " active" : ""}`}>
              <tab.icon /> <span>{t(tab.key)}</span>
            </Link>
          ))}
        </nav>
        <div className="topbar-right">
          {isAdmin && <Link href="/admin" className="chip" style={{ textDecoration: "none" }}>Admin</Link>}
          {plan && <span className={`chip${plan === "pro" ? " chip-accent" : ""}`}>{plan === "pro" ? t("plan.pro") : t("plan.free")}</span>}
          <LangToggle />
          <button className="btn btn-sm btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            {t("nav.signout")}
          </button>
        </div>
      </header>

      {/* mobile bottom tab bar (iOS 27 liquid glass) */}
      <nav className="tabbar glass-strong" aria-label="Tabs">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={`tab${isActive(tab.href) ? " active" : ""}`}>
            <span className="tab-ico"><tab.icon /></span>
            <span className="tab-label">{t(tab.key)}</span>
          </Link>
        ))}
      </nav>
    </>
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
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
    </svg>
  );
}
