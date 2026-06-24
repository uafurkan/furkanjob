import Link from "next/link";
import LiquidLens from "@/components/glass/LiquidLens";
import { LangToggle } from "@/components/i18n";
import { getT } from "@/lib/i18n-server";

export default function Landing() {
  const { t } = getT();
  const features = [
    { t: t("landing.f1.t"), d: t("landing.f1.d") },
    { t: t("landing.f2.t"), d: t("landing.f2.d") },
    { t: t("landing.f3.t"), d: t("landing.f3.d") },
  ];

  return (
    <main className="landing">
      <header className="site-header glass">
        <Link href="/" className="brand"><span className="brand-dot" /> paply</Link>
        <div className="topbar-right">
          <LangToggle />
          <Link href="/signin" className="btn btn-sm">{t("common.signin")}</Link>
        </div>
      </header>

      <section className="hero container">
        <div className="hero-copy reveal">
          <span className="chip chip-accent">{t("landing.badge")}</span>
          <h1 className="hero-title">
            {t("landing.title1")}
            <br />
            <span className="hero-grad">{t("landing.title2")}</span>
          </h1>
          <p className="hero-sub text-secondary">{t("landing.sub")}</p>
          <div className="row gap-3 wrap" style={{ marginTop: "var(--space-6)" }}>
            <Link href="/app/new" className="btn btn-primary">{t("common.start")}</Link>
            <Link href="/signin" className="btn">{t("common.signin")}</Link>
          </div>
          <p className="mono text-secondary" style={{ marginTop: "var(--space-4)", fontSize: "var(--text-12)" }}>
            {t("landing.countries")}
          </p>
        </div>

        <div className="hero-stage reveal delay-2">
          <LiquidLens width={140} height={140}>
            <div className="hero-scene">
              <div className="scene-side scene-raw">
                <div className="scene-tag">{t("landing.scene.pasted")}</div>
                <p>Lakeside Suites, Queenstown. Front desk &amp; kitchen roles. careers@example-hotel.co.nz</p>
              </div>
              <div className="scene-side scene-out">
                <div className="scene-tag">{t("landing.scene.application")}</div>
                <p><b>Front Desk / Kitchen — Lakeside Suites</b></p>
                <p className="text-secondary">Dear Hiring Manager, I require AEWV sponsorship to work in New Zealand…</p>
              </div>
            </div>
          </LiquidLens>
          <p className="hero-hint text-secondary">{t("landing.hint")}</p>
        </div>
      </section>

      <section className="features container">
        {features.map((f, i) => (
          <div key={i} className={`glass card feature reveal delay-${i + 1}`}>
            <h3>{f.t}</h3>
            <p className="text-secondary">{f.d}</p>
          </div>
        ))}
      </section>

      <section className="container" style={{ marginTop: "var(--space-12)" }}>
        <div className="glass card card-pad-lg stack gap-4 reveal">
          <span className="chip chip-ok">{t("landing.trust.badge")}</span>
          <h2 style={{ fontSize: "var(--text-28)" }}>{t("landing.trust.title")}</h2>
          <ul className="plan-list text-secondary" style={{ fontSize: "var(--text-16)" }}>
            <li>{t("landing.trust.1")}</li>
            <li>{t("landing.trust.2")}</li>
            <li>{t("landing.trust.3")}</li>
            <li>{t("landing.trust.4")}</li>
            <li>{t("landing.trust.5")}</li>
          </ul>
        </div>
      </section>

      <footer className="landing-foot container text-secondary">
        <span>paply</span>
        <Link href="/app/new" className="btn btn-sm">{t("landing.foot.cta")}</Link>
      </footer>
    </main>
  );
}
