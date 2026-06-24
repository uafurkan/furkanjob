import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfileForm from "@/components/ProfileForm";
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
    fullName: profile?.fullName || user.name || DEFAULT_PROFILE.fullName,
    contactEmail: profile?.contactEmail || user.email || DEFAULT_PROFILE.contactEmail,
    languages: profile?.languages?.length ? profile.languages : [...DEFAULT_PROFILE.languages],
    targetRoles: profile?.targetRoles?.length ? profile.targetRoles : [...DEFAULT_PROFILE.targetRoles],
    targetCountries: profile?.targetCountries?.length ? profile.targetCountries : [...DEFAULT_PROFILE.targetCountries],
    needsVisaSponsorship: profile?.needsVisaSponsorship ?? DEFAULT_PROFILE.needsVisaSponsorship,
    relocation: profile?.relocation ?? DEFAULT_PROFILE.relocation,
    shortBio: profile?.shortBio || "",
    includeSignature: profile?.includeSignature ?? DEFAULT_PROFILE.includeSignature,
    applicationLanguage: profile?.applicationLanguage || DEFAULT_PROFILE.applicationLanguage,
  };

  return (
    <main className="onboarding container">
      <header className="page-head reveal">
        <Link href="/" className="brand"><span className="brand-dot" /> paply</Link>
        <h1 style={{ marginTop: "var(--space-4)" }}>{t("onboarding.title")}</h1>
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
  );
}
