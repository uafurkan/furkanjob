import { getCurrentUser } from "@/lib/session";
import { getProfile, getDefaultCv, getDefaultEmailAccount, listApplications, getUsage, listDocuments } from "@/lib/db";
import { googleEnabled } from "@/lib/auth";
import { DEFAULT_PROFILE } from "@/lib/engine/rules";
import ProfileForm from "@/components/ProfileForm";
import DocumentsManager from "@/components/DocumentsManager";
import AccountData from "@/components/AccountData";
import { getT } from "@/lib/i18n-server";
import { planInfo } from "@/lib/plans";
import Link from "next/link";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { t, lang } = getT();
  const user = (await getCurrentUser())!;
  const [profile, cv, account, apps, used, allDocs] = await Promise.all([
    getProfile(user.id),
    getDefaultCv(user.id),
    getDefaultEmailAccount(user.id),
    listApplications(user.id),
    getUsage(user.id),
    listDocuments(user.id),
  ]);
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

  const status = (s: string) =>
    ({ sent: { l: t("apps.status.sent"), c: "chip-ok" }, failed: { l: t("apps.status.failed"), c: "chip-warn" }, draft: { l: t("apps.status.draft"), c: "" } } as Record<string, { l: string; c: string }>)[s] || { l: s, c: "" };

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>{t("nav.profile")}</h1>
        <p className="text-secondary">{t("pf.profile")}</p>
      </header>
      <ProfileForm
        mode="edit"
        initial={initial}
        cvFilename={cv?.filename || null}
        gmailConnected={account?.provider === "google"}
        googleEnabled={googleEnabled}
      />

      <DocumentsManager initial={libraryDocs} />

      {/* Applications list */}
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
          <div className="stack gap-3">
            {apps.map((a) => {
              const st = status(a.status);
              return (
                <div key={a.id} className="glass card app-row">
                  <div className="stack gap-1">
                    <div className="row gap-2 wrap">
                      <b>{a.company || "—"}</b>
                      <span className={`chip ${st.c}`}>{st.l}</span>
                      {a.country && <span className="chip">{a.country}</span>}
                    </div>
                    <span className="text-secondary" style={{ fontSize: "var(--text-14)" }}>{a.subject}</span>
                    <span className="mono text-secondary" style={{ fontSize: "var(--text-12)" }}>
                      → {a.recipients.join(", ") || "—"} · {new Date(a.createdAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}
                    </span>
                    {a.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{a.error}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AccountData />
    </div>
  );
}
