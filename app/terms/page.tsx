import Link from "next/link";
import { LangToggle } from "@/components/i18n";
import { getLang } from "@/lib/i18n-server";

export const metadata = {
  title: "Terms of Service — paply",
  description: "The terms governing your use of paply.",
};

const UPDATED = "2026-06-25";
const CONTACT = "furkanhlkk@gmail.com";

export default function TermsPage() {
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
          <h1>{tr ? "Kullanım Koşulları" : "Terms of Service"}</h1>
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
              : <>Questions about these terms? Email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</>}
          </p>
          <p>
            {tr
              ? <><Link href="/privacy">Gizlilik Politikası</Link>&apos;na da göz atın.</>
              : <>See also our <Link href="/privacy">Privacy Policy</Link>.</>}
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
        These terms govern your use of paply (&quot;the service&quot;), a tool by Veor that helps you send
        tailored job applications from your own email inbox. By using the service you agree to these terms.
      </p>

      <section className="legal-section">
        <h2>What the service does</h2>
        <p>
          You paste a business&apos;s page or details; the service detects the recipient, drafts an application,
          and sends it with your CV from <strong>your own connected Gmail</strong>. By default it shows you the
          draft and recipient first and only sends after you approve.
        </p>
      </section>

      <section className="legal-section">
        <h2>Your responsibilities</h2>
        <ul>
          <li>You are responsible for the content you send and for ensuring your applications are truthful and lawful.</li>
          <li>You confirm that information in your profile and CV is accurate and yours to use.</li>
          <li>You will not use the service to send spam, bulk unsolicited mail, harassment, or anything illegal.</li>
          <li>You will respect recipients&apos; wishes and applicable anti-spam laws (e.g. CAN-SPAM, GDPR e-privacy). The service is for genuine, individual job applications — not mass marketing.</li>
          <li>You must be at least 16 and have the right to connect the Gmail account you use.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Sending from your account</h2>
        <p>
          Emails are sent from your own inbox using a send-only Google permission. You are the sender; you remain
          accountable for what is sent. You can disconnect at any time.
        </p>
      </section>

      <section className="legal-section">
        <h2>AI-generated content</h2>
        <p>
          Drafts are generated automatically and may contain errors. <strong>Review every draft before sending.</strong>
          You are responsible for the final content. The service never invents recipient email addresses.
        </p>
      </section>

      <section className="legal-section">
        <h2>Plans &amp; payment</h2>
        <p>
          Free and paid plans may apply, with usage limits. Paid plans are billed via Stripe. You can cancel at
          any time; access continues until the end of the paid period. Fees already paid are non-refundable except
          where required by law.
        </p>
      </section>

      <section className="legal-section">
        <h2>Availability &amp; changes</h2>
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We may modify,
          suspend, or discontinue features. We may update these terms; continued use means you accept the changes.
        </p>
      </section>

      <section className="legal-section">
        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we are not liable for indirect or consequential damages, lost
          opportunities, or the outcome of any application you send. The service is a tool; hiring decisions and
          responses are outside our control.
        </p>
      </section>

      <section className="legal-section">
        <h2>Termination</h2>
        <p>
          You may stop using the service and delete your account at any time. We may suspend accounts that violate
          these terms or the law.
        </p>
      </section>

      <section className="legal-section">
        <h2>Contact</h2>
        <p>Questions about these terms can be sent to the email below.</p>
      </section>
    </>
  );
}

function TR() {
  return (
    <>
      <p className="legal-intro">
        Bu koşullar, kendi e-posta gelen kutunuzdan kişiye özel iş başvuruları göndermenize yardımcı olan
        Veor tarafından geliştirilen paply (&quot;hizmet&quot;) kullanımınızı düzenler. Hizmeti kullanarak bu
        koşulları kabul edersiniz.
      </p>

      <section className="legal-section">
        <h2>Hizmet ne yapar</h2>
        <p>
          Bir işletmenin sayfasını veya bilgilerini yapıştırırsınız; hizmet alıcıyı tespit eder, bir başvuru
          taslağı oluşturur ve <strong>kendi bağladığınız Gmail&apos;inizden</strong> CV&apos;nizle gönderir.
          Varsayılan olarak önce taslağı ve alıcıyı gösterir, yalnızca siz onayladıktan sonra gönderir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Sorumluluklarınız</h2>
        <ul>
          <li>Gönderdiğiniz içerikten ve başvurularınızın doğru ve yasal olmasından siz sorumlusunuz.</li>
          <li>Profilinizdeki ve CV&apos;nizdeki bilgilerin doğru ve size ait olduğunu onaylarsınız.</li>
          <li>Hizmeti spam, toplu istenmeyen posta, taciz veya yasadışı hiçbir şey göndermek için kullanmayacaksınız.</li>
          <li>Alıcıların isteklerine ve geçerli anti-spam yasalarına (ör. CAN-SPAM, GDPR e-gizlilik) saygı göstereceksiniz. Hizmet, gerçek ve bireysel iş başvuruları içindir — toplu pazarlama için değil.</li>
          <li>En az 16 yaşında olmalı ve kullandığınız Gmail hesabını bağlama hakkına sahip olmalısınız.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Kendi hesabınızdan gönderim</h2>
        <p>
          E-postalar, yalnızca gönderme yetkisi olan bir Google izniyle kendi gelen kutunuzdan gönderilir.
          Gönderen sizsiniz; gönderilenden siz sorumlu olursunuz. İstediğiniz an bağlantıyı kesebilirsiniz.
        </p>
      </section>

      <section className="legal-section">
        <h2>AI ile üretilen içerik</h2>
        <p>
          Taslaklar otomatik üretilir ve hata içerebilir. <strong>Göndermeden önce her taslağı gözden geçirin.</strong>
          Nihai içerikten siz sorumlusunuz. Hizmet alıcı e-posta adreslerini asla uydurmaz.
        </p>
      </section>

      <section className="legal-section">
        <h2>Planlar &amp; ödeme</h2>
        <p>
          Kullanım limitleriyle ücretsiz ve ücretli planlar geçerli olabilir. Ücretli planlar Stripe üzerinden
          faturalandırılır. İstediğiniz an iptal edebilirsiniz; erişim ödenen dönemin sonuna kadar sürer. Ödenmiş
          ücretler, yasanın gerektirdiği haller dışında iade edilmez.
        </p>
      </section>

      <section className="legal-section">
        <h2>Erişilebilirlik &amp; değişiklikler</h2>
        <p>
          Hizmet &quot;olduğu gibi&quot; ve &quot;mevcut olduğu sürece&quot; sunulur. Özellikleri değiştirebilir,
          askıya alabilir veya durdurabiliriz. Bu koşulları güncelleyebiliriz; kullanmaya devam etmeniz
          değişiklikleri kabul ettiğiniz anlamına gelir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Sorumluluğun sınırlandırılması</h2>
        <p>
          Yasanın izin verdiği azami ölçüde, dolaylı veya sonuçsal zararlardan, kaçırılan fırsatlardan veya
          gönderdiğiniz herhangi bir başvurunun sonucundan sorumlu değiliz. Hizmet bir araçtır; işe alım kararları
          ve yanıtlar kontrolümüz dışındadır.
        </p>
      </section>

      <section className="legal-section">
        <h2>Fesih</h2>
        <p>
          Hizmeti kullanmayı istediğiniz an bırakabilir ve hesabınızı silebilirsiniz. Bu koşulları veya yasayı
          ihlal eden hesapları askıya alabiliriz.
        </p>
      </section>

      <section className="legal-section">
        <h2>İletişim</h2>
        <p>Bu koşullarla ilgili sorular aşağıdaki e-postaya gönderilebilir.</p>
      </section>
    </>
  );
}
