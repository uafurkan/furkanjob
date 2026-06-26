import Link from "next/link";
import { LangToggle } from "@/components/i18n";
import { getT } from "@/lib/i18n-server";
import HeroDraft from "@/components/HeroDraft";
import StepsScene from "@/components/StepsScene";
import StatStrip from "@/components/StatStrip";

export default function Landing() {
  const { t } = getT();
  const faqs = [
    { q: t("landing.faq.q1"), a: t("landing.faq.a1") },
    { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
    { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
    { q: t("landing.faq.q4"), a: t("landing.faq.a4") },
    { q: t("landing.faq.q5"), a: t("landing.faq.a5") },
  ];
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
              <p className="text-secondary">
                <HeroDraft text="Dear Hiring Manager, I require AEWV sponsorship to work in New Zealand…" />
              </p>
            </div>
          </div>

          {/* Floating target-country pills — apply anywhere. */}
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit-chip" style={{ top: "-3%", left: "5%", animationDelay: "0s" }}>NZ</span>
            <span className="orbit-chip" style={{ top: "7%", right: "-5%", animationDelay: "1.1s" }}>AU</span>
            <span className="orbit-chip" style={{ top: "47%", right: "-7%", animationDelay: "2.3s" }}>UK</span>
            <span className="orbit-chip" style={{ bottom: "9%", left: "-6%", animationDelay: "1.7s" }}>US</span>
            <span className="orbit-chip" style={{ bottom: "-4%", right: "17%", animationDelay: "0.6s" }}>CA</span>
          </div>

          {/* Decorative: a paper plane carrying the application from pasted text → sent. */}
          <svg className="flight" viewBox="0 0 440 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <radialGradient id="flightTarget" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#7CE0D3" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#7CE0D3" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* origin (your pasted text) */}
            <circle className="flight-origin" cx="88" cy="206" r="4" />

            {/* flight route */}
            <path className="flight-path" d="M88,206 C180,150 250,210 348,128" fill="none" />

            {/* destination (delivered) */}
            <circle className="flight-glow" cx="348" cy="128" r="18" fill="url(#flightTarget)" />
            <g className="flight-target" transform="translate(348 128)">
              <circle r="8" fill="none" stroke="#7CE0D3" strokeWidth="2" />
              <path d="M-3.5,0 L-1,2.5 L4,-3" fill="none" stroke="#7CE0D3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>

            {/* the paper plane */}
            <g className="flight-plane">
              <path d="M13,0 L-12,-9 L-4,0 L-12,9 Z" fill="#FFFFFF" />
              <path d="M13,0 L-4,0 L-12,9 Z" fill="#5A93F0" fillOpacity="0.65" />
            </g>
          </svg>
        </div>
      </section>

      {/* How it works — sticky scrollytelling: the mockup morphs paste → draft → sent */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-8)", fontSize: "var(--text-24)" }}>
          {t("landing.steps.title")}
        </h2>
        <StepsScene
          steps={steps}
          labels={{
            pasted: t("landing.scene.pasted"),
            found: t("landing.scene.found"),
            application: t("landing.scene.application"),
            sent: t("landing.scene.sent"),
          }}
          sampleText="Aurelia Bay Hotel, Lindravale, New Zealand. We're hiring front desk & kitchen staff for the summer season."
          sampleEmail="careers@example-hotel.co.nz"
          draftText="Dear Hiring Manager, I require AEWV sponsorship to work in New Zealand…"
        />
      </section>

      {/* Stat strip — counts up on scroll into view */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <StatStrip
          stats={[
            { value: 5, label: t("landing.stat.visa") },
            { value: 5, label: t("landing.stat.countries") },
            { value: 30, prefix: "~", suffix: "s", label: t("landing.stat.send") },
          ]}
        />
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
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-4)", fontSize: "var(--text-24)" }}>
          {t("landing.pricing.title")}
          <span style={{ marginLeft: "var(--space-3)", display: "inline-block", fontSize: "var(--text-12)", fontWeight: 600, letterSpacing: "0.06em", padding: "2px 8px", borderRadius: "99px", background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)", verticalAlign: "middle", lineHeight: "1.6" }}>
            {t("landing.pricing.betaBadge")}
          </span>
        </h2>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--text-14)", marginBottom: "var(--space-8)", maxWidth: 520, margin: "0 auto var(--space-8)" }}>
          {t("landing.pricing.betaNote")}
        </p>
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

      {/* FAQ */}
      <section className="container" style={{ marginTop: "var(--space-16)" }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: "var(--space-8)", fontSize: "var(--text-24)" }}>
          {t("landing.faq.title")}
        </h2>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div key={i} className="glass card faq-item reveal">
              <h3 className="faq-q">{f.q}</h3>
              <p className="text-secondary faq-a">{f.a}</p>
            </div>
          ))}
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
