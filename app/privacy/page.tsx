import Link from "next/link";
import { LangToggle } from "@/components/i18n";
import { getLang } from "@/lib/i18n-server";

export const metadata = {
  title: "Privacy Policy",
  description: "How paply collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "2026-06-25";
const CONTACT = "help@paply.me";

export default function PrivacyPage() {
  const lang = getLang();
  const tr = lang === "tr";

  return (
    <main className="legal-page">
      <header className="site-header glass">
        <Link href="/" className="brand"><span className="brand-dot" /> paply</Link>
        <div className="topbar-right">
          <LangToggle />
          <Link href="/signin" className="btn btn-sm">{tr ? "Giriş" : "Sign in"}</Link>
        </div>
      </header>

      <article className="legal container">
        <div className="legal-hero">
          <h1>{tr ? "Gizlilik Politikası" : "Privacy Policy"}</h1>
          <div className="legal-meta">
            <span>{tr ? "Son güncelleme" : "Last updated"}: {UPDATED}</span>
            <span className="legal-meta-dot">·</span>
            <span>{tr ? "Türkçe / English" : "English / Türkçe"}</span>
          </div>
        </div>

        {tr ? <TR /> : <EN />}

        <div className="legal-footer">
          <p>
            {tr
              ? <>Sorularınız için: <a href={`mailto:${CONTACT}`}>{CONTACT}</a> adresine yazabilirsiniz.</>
              : <>Questions about this policy? Email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</>}
          </p>
          <p>
            {tr
              ? <><Link href="/terms">Kullanım Koşulları</Link>&apos;na da göz atın.</>
              : <>See also our <Link href="/terms">Terms of Service</Link>.</>}
          </p>
          <div><Link href="/" className="btn btn-sm">{tr ? "← Ana sayfa" : "← Home"}</Link></div>
        </div>
      </article>
    </main>
  );
}

function EN() {
  return (
    <>
      <p className="legal-intro">
        paply (&quot;we&quot;, &quot;the service&quot;) helps you send tailored job applications from your own
        email inbox. This policy explains what we collect, why, and the control you have. We follow a
        privacy-first, minimal-data approach.
      </p>

      <section className="legal-section">
        <h2>Data we collect</h2>
        <ul>
          <li><strong>Account info</strong> — when you sign in with Google: your email address, name, and profile picture.</li>
          <li><strong>Gmail send permission</strong> — a <em>send-only</em> OAuth token (<code>gmail.send</code>). We can send email <em>on your behalf from your own inbox</em>. We <strong>cannot read, scan, or access</strong> your existing emails, contacts, or any other mailbox data.</li>
          <li><strong>Profile you provide</strong> — full name, contact email, languages, target roles, target countries, visa-sponsorship need, short bio.</li>
          <li><strong>Your CV</strong> — the PDF you upload, stored so it can be attached to applications. We extract text from it (with an AI provider) only to help pre-fill your profile.</li>
          <li><strong>Applications</strong> — the business text you paste, recipient address, generated subject/body, and send status, kept so you can see your history.</li>
          <li><strong>Usage</strong> — number of applications sent per period, for plan limits.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>How we use it</h2>
        <ul>
          <li>To generate tailored application drafts and send them from your connected inbox.</li>
          <li>To find a business&apos;s <strong>real, published</strong> contact email when the pasted text has none (by scraping the page you reference or a public web search). We <strong>never invent or guess</strong> email addresses.</li>
          <li>To show your application history and enforce plan limits.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Email finding &amp; web scraping</h2>
        <p>
          When you paste a business page without an email, the service may fetch that business&apos;s own
          website (and its contact page) or run a public search to locate a <strong>genuinely published</strong>
          address. Only addresses that actually appear on a real page are used — none are fabricated.
        </p>
      </section>

      <section className="legal-section">
        <h2>Third parties we share data with</h2>
        <p>We use a small set of processors strictly to run the service:</p>
        <ul>
          <li><strong>Google</strong> — sign-in and Gmail send (send-only).</li>
          <li><strong>AI provider</strong> (e.g. Groq / Anthropic) — receives the pasted business text, your profile fields, and CV text to generate drafts. Not used to train models on your behalf.</li>
          <li><strong>Database &amp; hosting</strong> (Neon, Vercel) — store and serve your data.</li>
          <li><strong>Stripe</strong> — payments. Your card details go directly to Stripe and never touch our servers.</li>
        </ul>
        <p>We do not sell your data or share it for advertising.</p>
      </section>

      <section className="legal-section">
        <h2>Security</h2>
        <ul>
          <li>OAuth tokens are stored <strong>encrypted</strong>.</li>
          <li>We request the minimum Google scope needed (<code>gmail.send</code> only).</li>
          <li>You can disconnect your Gmail at any time, which revokes our send access.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Google API Services User Data Policy</h2>
        <p>
          paply&apos;s use and transfer of information received from Google APIs to any other app will adhere to{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements. We only request the <code>gmail.send</code> scope, use it
          solely to send application emails on your explicit, in-app instruction from your own connected inbox,
          never read, scan, or share the contents of your mailbox, and never use this data for advertising or to
          train generalized AI/ML models.
        </p>
      </section>

      <section className="legal-section">
        <h2>Your rights (GDPR / KVKK)</h2>
        <p>
          You can access, correct, export, or delete your data, and withdraw consent at any time. Disconnecting
          Gmail revokes sending access immediately; deleting your account removes your profile, CV, and
          application history. To exercise any right, email us at the address below.
        </p>
      </section>

      <section className="legal-section">
        <h2>Data retention</h2>
        <p>
          We keep your data while your account is active. When you delete your account or CV, the corresponding
          records are removed. Tokens are deleted when you disconnect.
        </p>
      </section>

      <section className="legal-section">
        <h2>Children</h2>
        <p>The service is not directed to anyone under 16.</p>
      </section>

      <section className="legal-section">
        <h2>Changes</h2>
        <p>We may update this policy; material changes will be reflected by the &quot;last updated&quot; date above.</p>
      </section>
    </>
  );
}

function TR() {
  return (
    <>
      <p className="legal-intro">
        paply (&quot;biz&quot;, &quot;hizmet&quot;), kendi e-posta gelen kutunuzdan kişiye özel iş başvuruları
        göndermenize yardımcı olur. Bu politika neyi, neden topladığımızı ve sahip olduğunuz kontrolü açıklar.
        Gizlilik öncelikli, asgari-veri yaklaşımını benimsiyoruz.
      </p>

      <section className="legal-section">
        <h2>Topladığımız veriler</h2>
        <ul>
          <li><strong>Hesap bilgisi</strong> — Google ile giriş yaptığınızda: e-posta adresiniz, adınız ve profil fotoğrafınız.</li>
          <li><strong>Gmail gönderme izni</strong> — yalnızca <em>gönderme</em> yetkisi olan bir OAuth token&apos;ı (<code>gmail.send</code>). Sizin <em>kendi gelen kutunuzdan adınıza</em> e-posta gönderebiliriz. Mevcut e-postalarınızı, kişilerinizi veya başka posta kutusu verinizi <strong>okuyamaz, tarayamaz, erişemeyiz</strong>.</li>
          <li><strong>Sağladığınız profil</strong> — ad-soyad, iletişim e-postası, diller, hedef roller, hedef ülkeler, vize-sponsorluğu ihtiyacı, kısa biyografi.</li>
          <li><strong>CV&apos;niz</strong> — yüklediğiniz PDF, başvurulara eklenebilmesi için saklanır. Profilinizi otomatik doldurmaya yardımcı olmak için (bir AI sağlayıcıyla) yalnızca metnini çıkarırız.</li>
          <li><strong>Başvurular</strong> — yapıştırdığınız işletme metni, alıcı adresi, üretilen konu/içerik ve gönderim durumu; geçmişinizi görebilmeniz için saklanır.</li>
          <li><strong>Kullanım</strong> — plan limitleri için dönem başına gönderilen başvuru sayısı.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Verileri nasıl kullanırız</h2>
        <ul>
          <li>Kişiye özel başvuru taslakları üretmek ve bağladığınız gelen kutusundan göndermek için.</li>
          <li>Yapıştırılan metinde e-posta yoksa işletmenin <strong>gerçek, yayınlanmış</strong> iletişim adresini bulmak için (referans verdiğiniz sayfayı tarayarak veya açık web aramasıyla). E-posta adreslerini <strong>asla uydurmaz veya tahmin etmeyiz</strong>.</li>
          <li>Başvuru geçmişinizi göstermek ve plan limitlerini uygulamak için.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>E-posta bulma &amp; web taraması</h2>
        <p>
          E-postasız bir işletme sayfası yapıştırdığınızda hizmet, o işletmenin <strong>kendi</strong> web sitesini
          (ve iletişim sayfasını) çekebilir veya <strong>gerçekten yayınlanmış</strong> bir adresi bulmak için açık
          bir arama yapabilir. Yalnızca gerçek bir sayfada görünen adresler kullanılır — hiçbiri uydurulmaz.
        </p>
      </section>

      <section className="legal-section">
        <h2>Veri paylaştığımız üçüncü taraflar</h2>
        <p>Hizmeti çalıştırmak için sınırlı sayıda işleyici kullanırız:</p>
        <ul>
          <li><strong>Google</strong> — giriş ve Gmail gönderimi (yalnızca gönderme).</li>
          <li><strong>AI sağlayıcı</strong> (ör. Groq / Anthropic) — taslak üretmek için yapıştırılan işletme metnini, profil alanlarınızı ve CV metnini alır. Sizin adınıza model eğitimi için kullanılmaz.</li>
          <li><strong>Veritabanı &amp; barındırma</strong> (Neon, Vercel) — verinizi saklar ve sunar.</li>
          <li><strong>Stripe</strong> — ödemeler. Kart bilgileriniz doğrudan Stripe&apos;a gider, sunucularımıza asla dokunmaz.</li>
        </ul>
        <p>Verinizi satmıyor, reklam için paylaşmıyoruz.</p>
      </section>

      <section className="legal-section">
        <h2>Güvenlik</h2>
        <ul>
          <li>OAuth token&apos;ları <strong>şifreli</strong> saklanır.</li>
          <li>Gereken asgari Google yetkisini isteriz (yalnızca <code>gmail.send</code>).</li>
          <li>Gmail&apos;inizi istediğiniz an bağlantısını kesebilirsiniz; bu, gönderme erişimimizi iptal eder.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Google API Services Kullanıcı Verisi Politikası</h2>
        <p>
          paply&apos;nin Google API&apos;lerinden alınan bilgileri kullanımı ve başka bir uygulamaya aktarımı,{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>&apos;na (Sınırlı Kullanım/Limited Use şartları dahil) uygun şekilde gerçekleşir. Yalnızca{" "}
          <code>gmail.send</code> yetkisini talep ederiz; bunu yalnızca sizin uygulama içinde açıkça verdiğiniz
          talimatla, kendi bağladığınız gelen kutunuzdan başvuru e-postası göndermek için kullanırız, posta
          kutunuzun içeriğini asla okumaz/taramaz/paylaşmayız ve bu veriyi reklam veya genel amaçlı yapay
          zekâ/ML modeli eğitimi için asla kullanmayız.
        </p>
      </section>

      <section className="legal-section">
        <h2>Haklarınız (GDPR / KVKK)</h2>
        <p>
          Verilerinize erişebilir, düzeltebilir, dışa aktarabilir veya silebilir ve onayınızı her an geri
          çekebilirsiniz. Gmail bağlantısını kesmek gönderme erişimini anında iptal eder; hesabınızı silmek
          profilinizi, CV&apos;nizi ve başvuru geçmişinizi kaldırır. Herhangi bir hakkı kullanmak için aşağıdaki
          adresten bize yazın.
        </p>
      </section>

      <section className="legal-section">
        <h2>Veri saklama</h2>
        <p>
          Verilerinizi hesabınız aktif olduğu sürece saklarız. Hesabınızı veya CV&apos;nizi sildiğinizde ilgili
          kayıtlar kaldırılır. Token&apos;lar bağlantıyı kestiğinizde silinir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Çocuklar</h2>
        <p>Hizmet 16 yaşından küçüklere yönelik değildir.</p>
      </section>

      <section className="legal-section">
        <h2>Değişiklikler</h2>
        <p>Bu politikayı güncelleyebiliriz; önemli değişiklikler yukarıdaki &quot;son güncelleme&quot; tarihine yansıtılır.</p>
      </section>
    </>
  );
}
