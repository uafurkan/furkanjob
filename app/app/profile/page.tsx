import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount, listDocuments, listCvs, listCountryCoverLetters } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfilePageClient from "@/components/ProfilePageClient";
import DocumentsManager from "@/components/DocumentsManager";
import CountryCoverLetterManager from "@/components/CountryCoverLetterManager";
import AccountData from "@/components/AccountData";
import { computeProfileScore } from "@/lib/profile-score";
import { getT } from "@/lib/i18n-server";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { t } = getT();
  const user = (await getCurrentUser())!;
  const [profile, cv, account, allDocs, cvs, ccls] = await Promise.all([
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
    listDocuments(user.id),
    listCvs(user.id),
    listCountryCoverLetters(user.id),
  ]);
  const cvList = cvs.map((c) => ({ id: c.id, filename: c.filename, isDefault: c.isDefault }));
  const libraryDocs = allDocs
    .filter((d) => d.type !== "visa")
    .map((d) => ({ id: d.id, type: d.type, filename: d.filename, size: d.size }));

  const initial = {
    fullName: profile?.fullName || "",
    contactEmail: profile?.contactEmail || "",
    languages: profile?.languages || [],
    targetRoles: profile?.targetRoles || [],
    targetCountries: profile?.targetCountries || [],
    needsVisaSponsorship: profile?.needsVisaSponsorship ?? true,
    relocation: profile?.relocation ?? true,
    shortBio: profile?.shortBio || "",
    currentCountry: profile?.currentCountry || "",
    includeSignature: profile?.includeSignature ?? false,
    digestOptOut: profile?.digestOptOut ?? false,
    reminderOptOut: profile?.reminderOptOut ?? false,
    weeklyGoal: profile?.weeklyGoal ?? 0,
    applicationLanguage: profile?.applicationLanguage || "auto",
    hasVisa: profile?.hasVisa ?? false,
    visaType: profile?.visaType || "",
    visaLabel: profile?.visaLabel || "",
    visaCountries: profile?.visaCountries || [],
  };

  const score = computeProfileScore(profile, cvList.length, account?.provider === "google");

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{t("nav.profile")}</h1>
        <p className="text-secondary">{t("pf.profile")}</p>
      </header>

      {score.pct < 100 && (
        <div className="glass card stack gap-3">
          <div className="row gap-2" style={{ alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>{t("score.title")}</h3>
            <span className="text-secondary" style={{ marginLeft: "auto", fontSize: "var(--text-13)" }}>{score.pct}%</span>
          </div>
          <span className="score-bar"><span className="score-fill" style={{ width: `${score.pct}%` }} /></span>
          <div className="row gap-2 wrap">
            <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{t("score.missing")}:</span>
            {score.missing.map((k) => (
              <span key={k} className="chip">{t(`score.${k}`)}</span>
            ))}
          </div>
        </div>
      )}

      <ProfilePageClient
        initial={initial}
        cvFilename={cv?.filename || null}
        initialCvs={cvList}
        gmailConnected={account?.provider === "google"}
        googleEnabled={googleEnabled}
      />

      <DocumentsManager initial={libraryDocs} />

      <CountryCoverLetterManager
        initial={ccls.map((c) => ({ id: c.id, countryCode: c.countryCode, filename: c.filename, size: c.size }))}
      />

      <AccountData />
    </div>
  );
}
