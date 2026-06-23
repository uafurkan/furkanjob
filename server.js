const path = require("path");
const fs = require("fs");

// Basit .env yükleyici (ek bağımlılık yok)
(function loadEnv() {
  try {
    const p = path.join(__dirname, ".env");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
})();

const express = require("express");
const nodemailer = require("nodemailer");

const { analyze } = require("./lib/detect");
const { buildDraft, APPLICANT } = require("./lib/template");
const { findEmails } = require("./lib/websearch");
const { aiDraft } = require("./lib/ai");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const FROM = process.env.GMAIL_USER || "furkanhulakojob@gmail.com";
const CV_PATH = process.env.CV_PATH || path.join(__dirname, "cv", "cv.pdf");

function mailer() {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) throw new Error("GMAIL_APP_PASSWORD env değişkeni tanımlı değil.");
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: FROM, pass },
  });
}

// 1) İçeriği analiz et: mail bul, yoksa web'de ara, taslak üret
app.post("/api/analyze", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    if (!text.trim()) return res.status(400).json({ error: "İçerik boş." });

    const analysis = analyze(text);
    let emails = analysis.emails;
    let emailSource = emails.length ? "text" : "none";

    if (!emails.length) {
      const found = await findEmails({
        urls: analysis.urls,
        company: analysis.company,
        country: analysis.country.name,
      });
      emails = found.emails;
      emailSource = found.source;
    }

    let draft = await aiDraft({ text, analysis });
    let draftSource = draft ? "ai" : "template";
    if (!draft) draft = buildDraft(analysis);

    res.json({
      from: FROM,
      emails,
      emailSource,
      company: analysis.company,
      country: analysis.country.name,
      positions: analysis.positions,
      subject: draft.subject,
      body: draft.body,
      draftSource,
      cvExists: fs.existsSync(CV_PATH),
      cvName: path.basename(CV_PATH),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2) Onaylanan taslağı CV ekiyle gönder
app.post("/api/send", async (req, res) => {
  try {
    const { to, subject, body } = req.body || {};
    const recipients = (Array.isArray(to) ? to : String(to || "").split(/[,;\s]+/))
      .map((s) => s.trim())
      .filter(Boolean);
    if (!recipients.length) return res.status(400).json({ error: "Alıcı e-posta yok." });
    if (!subject || !body) return res.status(400).json({ error: "Konu veya metin boş." });

    const attachments = [];
    if (fs.existsSync(CV_PATH)) {
      attachments.push({ filename: path.basename(CV_PATH), path: CV_PATH });
    }

    const info = await mailer().sendMail({
      from: `${APPLICANT.name} <${FROM}>`,
      to: recipients.join(", "),
      subject,
      text: body,
      attachments,
    });

    res.json({ ok: true, messageId: info.messageId, sentTo: recipients, cvAttached: attachments.length > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Çalışıyor: http://localhost:${PORT}`));
