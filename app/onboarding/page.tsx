import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfileForm from "@/components/ProfileForm";
import OnboardingNav from "@/components/nav/OnboardingNav";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Setup" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const [profile, cv, account] = await Promise.all([
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
  ]);

  const { t } = getT();
  const initial = {
    fullName: profile?.fullName || "",
    contactEmail: profile?.contactEmail || "",
    languages: profile?.languages?.length ? profile.languages : [],
    targetRoles: profile?.targetRoles?.length ? profile.targetRoles : [],
    targetCountries: profile?.targetCountries?.length ? profile.targetCountries : [],
    needsVisaSponsorship: profile?.needsVisaSponsorship ?? true,
    relocation: profile?.relocation ?? true,
    shortBio: profile?.shortBio || "",
    includeSignature: profile?.includeSignature ?? false,
    applicationLanguage: profile?.applicationLanguage || "auto",
    hasVisa: profile?.hasVisa ?? false,
    visaType: profile?.visaType || "",
    visaLabel: profile?.visaLabel || "",
    visaCountries: profile?.visaCountries || [],
  };

  return (
    <div className="app-shell">
      <OnboardingNav />
      <main className="onboarding container app-main">
        <header className="page-head reveal">
          <h1>{t("onboarding.title")}</h1>
          <p className="text-secondary">{t("onboarding.sub")}</p>
        </header>
      <ProfileForm
        mode="onboarding"
        initial={initial}
        cvFilename={cv?.filename || null}
        gmailConnected={account?.provider === "google"}
        googleEnabled={googleEnabled}
      />
      </main>
    </div>
  );
}
