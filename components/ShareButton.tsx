"use client";
import { useState } from "react";
import { useT } from "@/components/i18n";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://paply.me";

export default function ShareButton() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = `${t("billing.share.text")} ${BASE}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open a mailto draft
      window.location.href = `mailto:?subject=${encodeURIComponent(t("billing.share.emailSubject"))}&body=${encodeURIComponent(text)}`;
    }
  }

  return (
    <button className="btn btn-sm" onClick={share}>
      {copied ? t("billing.share.copied") : t("billing.share.cta")}
    </button>
  );
}
