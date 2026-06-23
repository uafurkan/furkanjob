# İş Başvuru Asistanı

İşletme (otel, restoran vb.) web sitesinin içeriğini yapıştır → sistem:

1. Metinden **e-posta adresini bulur**; yoksa **web'de resmi mailini arar** (sitedeki contact sayfası + arama motoru).
2. **Ülkeyi** (New Zealand / USA / Australia / Canada / UK) ve **pozisyonu** (front desk, kitchen, serving vb.) otomatik algılar.
3. O ülkeye uygun **vize/sponsorship diliyle** başvuru **taslağı ve konusu** üretir.
4. Onayladıktan sonra **CV'ni ekleyerek** `furkanhulakojob@gmail.com`'dan otomatik gönderir.

## Kurulum

```bash
npm install
cp .env.example .env      # sonra .env'i doldur
# CV'ni cv/cv.pdf olarak koy
npm start
```

Tarayıcıda: http://localhost:3000

## .env doldurma

- **GMAIL_APP_PASSWORD**: Google Hesabı → 2 Adımlı Doğrulama'yı aç → https://myaccount.google.com/apppasswords → 16 haneli kodu yapıştır.
- **CV**: `cv/cv.pdf` olarak koy (veya `.env`'de `CV_PATH`).
- **ANTHROPIC_API_KEY** (opsiyonel): koyarsan her işletmeye tamamen özgün metin üretir; boşsa akıllı şablon kullanılır.

## Güvenlik notu

E-posta göndermeden önce taslağı ekranda görüp **düzenleyip onaylıyorsun** — sistem arka planda sessizce göndermez. App Password ve CV `.gitignore`'da; repoya gitmez.

## Nasıl çalışır

- `lib/detect.js` — mail/URL çıkarımı, ülke & pozisyon & şirket algılama
- `lib/websearch.js` — mail yoksa site tarama + DuckDuckGo araması (API anahtarı gerekmez)
- `lib/template.js` — akıllı şablon (ülke/pozisyona göre)
- `lib/ai.js` — opsiyonel Claude API ile özgün taslak
- `server.js` — `/api/analyze` ve `/api/send` uçları + Gmail SMTP gönderim
- `public/index.html` — arayüz
