"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useT } from "@/components/i18n";

export default function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  return (
    <div className="stack gap-4" style={{ width: "100%" }}>
      {googleEnabled && (
        <button
          className="btn btn-block"
          data-loading={loading === "google"}
          onClick={() => {
            setLoading("google");
            signIn("google", { callbackUrl: "/app/new" });
          }}
        >
          {loading === "google" ? t("signin.redirecting") : t("signin.google")}
        </button>
      )}

      <div className="divider"><span>{googleEnabled ? t("signin.or") : t("signin.devonly")}</span></div>

      <form
        className="stack gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setLoading("demo");
          signIn("demo", { email, callbackUrl: "/app/new" });
        }}
      >
        <label className="field">
          <span className="field-label">{t("signin.email")}</span>
          <input className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-block" data-loading={loading === "demo"} type="submit">
          {loading === "demo" ? t("signin.signingin") : t("signin.demo")}
        </button>
      </form>

      {!googleEnabled && (
        <p className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("signin.devnote")}</p>
      )}
    </div>
  );
}
