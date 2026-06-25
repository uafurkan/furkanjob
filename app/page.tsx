import Link from "next/link";
import { LangToggle } from "@/components/i18n";
import { getT } from "@/lib/i18n-server";

export default function Landing() {
  const { t } = getT();
  const testimonials = [
    { q: t("landing.t1.quote"), n: t("landing.t1.name"), l: t("landing.t1.loc") },
    { q: t("landing.t2.quote"), n: t("landing.t2.name"), l: t("landing.t2.loc") },
    { q: t("landing.t3.quote"), n: t("landing.t3.name"), l: t("landing.t3.loc") },
  ];
  const features = [
    { t: t("landing.f1.t"), d: t("landing.f1.d") },
    { t: t("landing.f2.t"), d: t("landing.f2.d") },
    { t: t("landing.f3.t"), d: t("landing.f3.d") },
  ];
  const steps = [
    { n: t("landing.step1.n"), title: t("landing.step1.t"), d: t("landing.step1.d") },
    { n: t("landing.step2.n"), title: t("landing.step2.t"), d: t("landing.step2.d") },
    { n: t("landing.step3.n"), title: t("landing.step3.t"), d: t("landing.step3.d") },
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
          <div className="hero-scene">
            <div className="scene-side scene-raw">
              <div className="scene-tag">{t("landing.scene.pasted")}</div>
              <p>Aurelia Bay Hotel, Lindravale, New Zealand. Front desk &amp; kitchen roles. careers@example-hotel.co.nz</p>
            </div>
            <div className="scene-side scene-out">
              <div className="scene-tag">{t("landing.scene.application")}</div>
              <p><b>Front Desk / Kitchen — Aurelia Bay Hotel</b></p>
              <p className="text-secondary">Dear Hiring Manager, I require AEWV sponsorship to work in New Zealand…</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-8)", fontSize: "var(--text-24)" }}>
          {t("landing.steps.title")}
        </h2>
        <div className="steps-grid">
          {steps.map((s, i) => (
            <div key={i} className="glass card step-card reveal">
              <span className="step-num">{s.n}</span>
              <h3 style={{ fontSize: "var(--text-18)", margin: 0 }}>{s.title}</h3>
              <p className="text-secondary" style={{ margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-8)", fontSize: "var(--text-24)" }}>
          {t("landing.testimonials.title")}
        </h2>
        <div className="testimonials-grid">
          {testimonials.map((tm, i) => (
            <div key={i} className="glass card testimonial-card reveal">
              <p className="testimonial-quote">"{tm.q}"</p>
              <div className="testimonial-author">
                <b>{tm.n}</b>
                <span className="text-secondary">{tm.l}</span>
              </div>
            </div>
          ))}
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

      {/* Pricing */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-8)", fontSize: "var(--text-24)" }}>
          {t("landing.pricing.title")}
        </h2>
        <div className="plans landing-plans">
          <div className="glass card stack gap-3">
            <h3>{t("landing.pricing.free")}</h3>
            <p className="plan-price">{t("landing.pricing.freePrice")}</p>
            <ul className="plan-list text-secondary">
              <li>{t("landing.pricing.freeLine1")}</li>
              <li>{t("landing.pricing.freeLine2")}</li>
              <li>{t("landing.pricing.freeLine3")}</li>
              <li>{t("landing.pricing.freeLine4")}</li>
            </ul>
            <Link href="/signin" className="btn" style={{ alignSelf: "start" }}>{t("landing.pricing.cta")}</Link>
          </div>
          <div className="glass glass-strong card stack gap-3 plan-featured">
            <h3>{t("landing.pricing.pro")}</h3>
            <p className="plan-price">{t("landing.pricing.proPrice")}</p>
            <ul className="plan-list text-secondary">
              <li>{t("landing.pricing.proLine1")}</li>
              <li>{t("landing.pricing.proLine2")}</li>
              <li>{t("landing.pricing.proLine3")}</li>
              <li>{t("landing.pricing.proLine4")}</li>
            </ul>
            <Link href="/signin" className="btn btn-primary" style={{ alignSelf: "start" }}>{t("landing.pricing.upgrade")}</Link>
          </div>
        </div>
      </section>

      <footer className="landing-foot container text-secondary">
        <span>
          <a href="https://paply.me" style={{ textDecoration: "none", color: "inherit" }}>paply.me</a> &nbsp;·&nbsp;
          <span style={{ fontSize: "var(--text-12)", opacity: 0.55 }}>by <strong style={{ fontWeight: 600, color: "var(--content-secondary)" }}>Veor</strong></span>
        </span>
        <span className="foot-links">
          <Link href="/privacy">{t("foot.privacy")}</Link>
          <Link href="/terms">{t("foot.terms")}</Link>
          <Link href="/app/new" className="btn btn-sm">{t("landing.foot.cta")}</Link>
        </span>
      </footer>
    </main>
  );
}
