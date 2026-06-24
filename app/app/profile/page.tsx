import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfileForm from "@/components/ProfileForm";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { t: tt } = getT();
  const user = (await getCurrentUser())!;
  const [profile, cv, account] = await Promise.all([
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
  ]);

  const initial = {
    fullName: profile?.fullName || user.name || DEFAULT_PROFILE.fullName,
    contactEmail: profile?.contactEmail || user.email || "",
    languages: profile?.languages || [...DEFAULT_PROFILE.languages],
    targetRoles: profile?.targetRoles || [...DEFAULT_PROFILE.targetRoles],
    targetCountries: profile?.targetCountries || [...DEFAULT_PROFILE.targetCountries],
    needsVisaSponsorship: profile?.needsVisaSponsorship ?? true,
    relocation: profile?.relocation ?? true,
    shortBio: profile?.shortBio || "",
    includeSignature: profile?.includeSignature ?? false,
    applicationLanguage: profile?.applicationLanguage || "auto",
  };

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{tt("nav.profile")}</h1>
        <p className="text-secondary">{tt("pf.profile")}</p>
      </header>
      <ProfileForm
        mode="edit"
        initial={initial}
        cvFilename={cv?.filename || null}
        gmailConnected={account?.provider === "google"}
        googleEnabled={googleEnabled}
      />
    </div>
  );
}
