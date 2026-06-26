"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useT } from "@/components/i18n";

export default function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);

  if (!googleEnabled) {
    return (
      <div className="stack gap-4" style={{ width: "100%" }}>
        <p className="text-secondary" style={{ textAlign: "center" }}>
          {t("signin.noGoogle")}
        </p>
      </div>
    );
  }

  return (
    <div className="stack gap-4" style={{ width: "100%" }}>
      <button
        className="btn btn-primary btn-block"
        data-loading={loading}
        onClick={() => {
          setLoading(true);
          signIn("google", { callbackUrl: "/app/new" });
        }}
      >
        {loading ? t("signin.redirecting") : t("signin.google")}
      </button>
    </div>
  );
}
