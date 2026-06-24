import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import SignInForm from "@/components/auth/SignInForm";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  const { t } = getT();
  return (
    <main className="centered-page">
      <div className="glass-strong card card-pad-lg auth-card reveal">
        <Link href="/" className="brand" style={{ justifyContent: "center", marginBottom: "var(--space-4)" }}>
          <span className="brand-dot" /> applythatforme
        </Link>
        <h1 style={{ textAlign: "center", fontSize: "var(--text-28)" }}>{t("signin.title")}</h1>
        <p className="text-secondary" style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
          {t("signin.sub")}
        </p>
        <SignInForm googleEnabled={googleEnabled} />
      </div>
    </main>
  );
}
