import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount, listApplications, getUsage, listDocuments, listCvs } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfileForm from "@/components/ProfileForm";
import DocumentsManager from "@/components/DocumentsManager";
import AccountData from "@/components/AccountData";
import ApplicationsBoard from "@/components/ApplicationsBoard";
import { computeInsights } from "@/lib/applications";
import { computeProfileScore } from "@/lib/profile-score";
import { getT } from "@/lib/i18n-server";
import { planInfo } from "@/lib/plans";
import Link from "next/link";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { t } = getT();
  const user = (await getCurrentUser())!;
  const [profile, cv, account, apps, used, allDocs, cvs] = await Promise.all([
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
    listApplications(user.id),
    getUsage(user.id),
    listDocuments(user.id),
    listCvs(user.id),
  ]);
  const cvList = cvs.map((c) => ({ id: c.id, filename: c.filename, isDefault: c.isDefault }));
  const libraryDocs = allDocs
    .filter((d) => d.type !== "visa")
    .map((d) => ({ id: d.id, type: d.type, filename: d.filename, size: d.size }));
  const limit = planInfo(user.plan).monthlyLimit;

  const initial = {
    fullName: profile?.fullName || "",
    contactEmail: profile?.contactEmail || "",
    languages: profile?.languages || [],
    targetRoles: profile?.targetRoles || [],
    targetCountries: profile?.targetCountries || [],
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

      <ProfileForm
        mode="edit"
        initial={initial}
        cvFilename={cv?.filename || null}
        initialCvs={cvList}
        gmailConnected={account?.provider === "google"}
        googleEnabled={googleEnabled}
      />

      <DocumentsManager initial={libraryDocs} />

      {/* Applications list + tracking pipeline */}
      <section id="applications" className="stack gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <h2 style={{ fontSize: "var(--text-16)", fontWeight: 600, margin: 0 }}>{t("apps.title")}</h2>
          <span className="text-secondary" style={{ fontSize: "var(--text-13)", marginLeft: "auto" }}>
            {used}{limit === Infinity ? "" : ` / ${limit}`} {t("apps.thisMonth")}
          </span>
        </div>

        {apps.length === 0 ? (
          <div className="glass card stack gap-3 empty">
            <h3>{t("apps.empty.title")}</h3>
            <p className="text-secondary">{t("apps.empty.sub")}</p>
            <Link href="/app/new" className="btn btn-primary" style={{ alignSelf: "start" }}>{t("apps.new")}</Link>
          </div>
        ) : (
          <>
          {(() => {
            const ins = computeInsights(apps);
            if (ins.dispatched === 0) return null;
            const pct = Math.round(ins.responseRate * 100);
            return (
              <div className="glass card stack gap-4">
                <h3 style={{ margin: 0 }}>{t("insights.title")}</h3>
                <div className="stat-grid">
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{pct}<span className="stat-sub">%</span></span>
                    <span className="stat-label">{t("insights.responseRate")}</span>
                  </div>
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{ins.interview}</span>
                    <span className="stat-label">{t("apps.status.interview")}</span>
                  </div>
                  <div className="stat" style={{ padding: 0 }}>
                    <span className="stat-value">{ins.offer}</span>
                    <span className="stat-label">{t("apps.status.offer")}</span>
                  </div>
                </div>
                {(ins.byCountry.length > 0 || ins.byRole.length > 0) && (
                  <div className="insights-cols">
                    {ins.byCountry.length > 0 && (
                      <div className="stack gap-2">
                        <span className="field-label">{t("insights.byCountry")}</span>
                        {ins.byCountry.map((r) => (
                          <div key={r.name} className="insight-bar-row">
                            <span className="insight-bar-name">{r.name}</span>
                            <span className="insight-bar-track"><span className="insight-bar-fill" style={{ width: `${Math.max(6, Math.round((r.responded / r.count) * 100))}%` }} /></span>
                            <span className="insight-bar-num">{r.responded}/{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ins.byRole.length > 0 && (
                      <div className="stack gap-2">
                        <span className="field-label">{t("insights.byRole")}</span>
                        {ins.byRole.map((r) => (
                          <div key={r.name} className="insight-bar-row">
                            <span className="insight-bar-name">{r.name}</span>
                            <span className="insight-bar-track"><span className="insight-bar-fill" style={{ width: `${Math.max(6, Math.round((r.responded / r.count) * 100))}%` }} /></span>
                            <span className="insight-bar-num">{r.responded}/{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("insights.note")}</span>
              </div>
            );
          })()}
          <ApplicationsBoard
            initial={apps.map((a) => ({
              id: a.id, company: a.company ?? null, country: a.country ?? null, subject: a.subject,
              recipients: a.recipients, status: a.status, error: a.error ?? null,
              createdAt: a.createdAt, sentAt: a.sentAt ?? null,
              body: a.body, positions: a.positions,
              emailSource: a.emailSource, draftSource: a.draftSource,
              notes: a.notes ?? null,
            }))}
          />
          </>
        )}
      </section>

      <AccountData />
    </div>
  );
}
