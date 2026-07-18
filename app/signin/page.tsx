import Link from "next/link";
import { LangToggle } from "@/components/i18n";
import { googleEnabled } from "@/lib/auth";
import SignInForm from "@/components/auth/SignInForm";
import { getT } from "@/lib/i18n-server";

export const metadata = {
  title: "Sign in",
  description: "Sign in to paply and start sending visa-sponsorship job applications with your CV.",
  alternates: { canonical: "/signin" },
};

export default function SignInPage() {
  const { t } = getT();
  return (
    <div className="app-shell">
      <header className="site-header glass">
        <Link href="/" className="brand" aria-label="paply"><span className="brand-dot" /> paply</Link>
        <div className="topbar-right"><LangToggle /></div>
      </header>
      <main className="centered-page">
      <div className="glass-strong card card-pad-lg auth-card reveal">
        <h1 style={{ textAlign: "center", fontSize: "var(--text-28)" }}>{t("signin.title")}</h1>
        <p className="text-secondary" style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
          {t("signin.sub")}
        </p>
        <SignInForm googleEnabled={googleEnabled} />
      </div>
      </main>
    </div>
  );
}
