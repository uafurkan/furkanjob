"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UpgradeButton({
  manage = false,
  labelManage,
  labelUpgrade,
  labelOpening,
}: {
  manage?: boolean;
  labelManage: string;
  labelUpgrade: string;
  labelOpening: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const endpoint = manage ? "/api/stripe/portal" : "/api/stripe/checkout";

  return (
    <button
      className={`btn ${manage ? "btn-sm" : "btn-primary"}`}
      data-loading={loading}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await fetch(endpoint, { method: "POST" });
          const d = await r.json();
          if (d.url) {
            if (d.stub) {
              router.push(d.url);
              router.refresh();
            } else {
              window.location.href = d.url;
            }
          }
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? labelOpening : manage ? labelManage : labelUpgrade}
    </button>
  );
}
