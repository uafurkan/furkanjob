import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getProfile, getDefaultCv, getCvData, getDefaultEmailAccount, updateEmailAccountTokens,
  createApplication, incrementUsage, getUsage,
} from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { isOverLimit } from "@/lib/plans";
import {
  sendViaGmailApi, sendViaSmtp, refreshGoogleAccessToken, resolveCvPath, type Attachment, type SendResult,
} from "@/lib/engine/mailer";
import fs from "node:fs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    return await handleSend(req);
  } catch (e: any) {
    // Never leak an HTML 500 page — the client expects JSON.
    console.error("send route error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Sunucu hatası" }, { status: 500 });
  }
}

async function handleSend(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const used = await getUsage(user.id);
  if (isOverLimit(user.plan, used)) {
    return NextResponse.json({ error: "Aylık limit doldu.", paywall: true }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const recipients: string[] = (Array.isArray(body?.to) ? body.to : String(body?.to || "").split(/[,;\s]+/))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const subject: string = (body?.subject || "").toString();
  const text: string = (body?.body || "").toString();

  if (!recipients.length) return NextResponse.json({ error: "Alıcı e-posta yok." }, { status: 400 });
  if (!subject || !text) return NextResponse.json({ error: "Konu veya metin boş." }, { status: 400 });

  const profile = await getProfile(user.id);
  const fromName = profile?.fullName || user.name || "Applicant";

  // CV attachment
  const cv = await getDefaultCv(user.id);
  const attachments: Attachment[] = [];
  if (cv) {
    const bytes = await getCvData(cv.id);
    if (bytes) {
      attachments.push({ filename: cv.filename, content: bytes, mime: cv.mime });
    } else {
      // Legacy/dev: CV stored on disk rather than in the DB.
      const abs = resolveCvPath(cv.storageKey);
      if (fs.existsSync(abs)) attachments.push({ filename: cv.filename, absPath: abs, mime: cv.mime });
    }
  }

  // Choose sending method
  const account = await getDefaultEmailAccount(user.id);
  let result: SendResult;
  let fromEmail = account?.address || process.env.SMTP_USER || user.email;

  if (account?.provider === "google" && account.refreshToken) {
    let accessToken = decrypt(account.accessToken);
    const expired = !account.expiresAt || account.expiresAt * 1000 < Date.now() + 30_000;
    if (expired || !accessToken) {
      const refresh = decrypt(account.refreshToken);
      const fresh = refresh ? await refreshGoogleAccessToken(refresh) : null;
      if (fresh) {
        accessToken = fresh;
        await updateEmailAccountTokens(
          account.id,
          encrypt(fresh) || "",
          Math.floor(Date.now() / 1000) + 3500
        );
      }
    }
    if (!accessToken) {
      result = { ok: false, error: "Gmail erişimi yenilenemedi. Lütfen Gmail'i tekrar bağla." };
    } else {
      result = await sendViaGmailApi({
        accessToken, fromName, fromEmail, to: recipients, subject, body: text, attachments,
      });
    }
  } else if (process.env.SMTP_APP_PASSWORD) {
    fromEmail = process.env.SMTP_USER || fromEmail;
    result = await sendViaSmtp({
      user: fromEmail, pass: process.env.SMTP_APP_PASSWORD, fromName, to: recipients, subject, body: text, attachments,
    });
  } else {
    result = { ok: false, error: "Gönderim yöntemi yok: Gmail bağla veya SMTP_APP_PASSWORD ayarla." };
  }

  await createApplication({
    userId: user.id,
    company: body?.company || null,
    country: body?.country || null,
    positions: Array.isArray(body?.positions) ? body.positions : [],
    recipients,
    emailSource: body?.emailSource || "manual",
    draftSource: body?.draftSource || "template",
    subject,
    body: text,
    status: result.ok ? "sent" : "failed",
    providerMsgId: result.ok ? result.messageId : null,
    error: result.ok ? null : result.error,
    sentAt: result.ok ? new Date().toISOString() : null,
  });

  if (result.ok) {
    await incrementUsage(user.id);
    return NextResponse.json({ ok: true, sentTo: recipients, from: fromEmail, cvAttached: attachments.length > 0 });
  }
  return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
}
