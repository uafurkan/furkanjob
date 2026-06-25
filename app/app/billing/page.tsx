import { getCurrentUser } from "@/lib/session";
import { getUsage } from "@/lib/db";
import { PLANS, planInfo } from "@/lib/plans";
import UpgradeButton from "@/components/UpgradeButton";
import ShareButton from "@/components/ShareButton";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Pro" };

export default async function BillingPage() {
  const { t } = getT();
  const user = (await getCurrentUser())!;
  const used = await getUsage(user.id);
  const stripeLive = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";
  const isPro = user.plan === "pro" || user.plan === "team";

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{t("billing.title")}</h1>
        <p className="text-secondary">
          {t("billing.current")}: <b>{planInfo(user.plan).name}</b> · {used} {t("billing.applications")}
          {!stripeLive && <span className="chip" style={{ marginLeft: 8 }}>{t("billing.dev")}</span>}
        </p>
      </header>

      <div className="plans">
        <div className="glass card stack gap-3">
          <h3>{PLANS.free.name}</h3>
          <p className="plan-price">{PLANS.free.price}</p>
          <ul className="plan-list text-secondary">
            <li>{PLANS.free.monthlyLimit} {t("billing.free.limit")}</li>
            <li>{t("billing.free.tmpl")}</li>
            <li>{t("billing.free.find")}</li>
            <li>{t("billing.free.cv")}</li>
          </ul>
          {!isPro && <span className="chip" style={{ alignSelf: "start" }}>{t("billing.current.badge")}</span>}
        </div>

        <div className="glass glass-strong card stack gap-3 plan-featured">
          <h3>{PLANS.pro.name}</h3>
          <p className="plan-price">{PLANS.pro.price}</p>
          <ul className="plan-list text-secondary">
            <li>{t("billing.pro.unlimited")}</li>
            <li>{t("billing.pro.ai")}</li>
            <li>{t("billing.pro.auto")}</li>
            <li>{t("billing.pro.support")}</li>
          </ul>
          {isPro ? (
            <div className="row gap-3 wrap">
              <span className="chip chip-accent">{t("billing.pro.active")}</span>
              <UpgradeButton manage labelManage={t("billing.manage")} labelUpgrade={t("billing.upgrade")} labelOpening={t("billing.opening")} />
            </div>
          ) : (
            <UpgradeButton labelManage={t("billing.manage")} labelUpgrade={t("billing.upgrade")} labelOpening={t("billing.opening")} />
          )}
          <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("billing.wallets")}</span>
        </div>
      </div>

      <div className="glass card stack gap-3">
        <div className="stack gap-1">
          <h3>{t("billing.share.title")}</h3>
          <p className="text-secondary" style={{ fontSize: "var(--text-13)", margin: 0 }}>{t("billing.share.sub")}</p>
        </div>
        <ShareButton />
      </div>
    </div>
  );
}
