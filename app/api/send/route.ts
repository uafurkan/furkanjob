import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getProfile, getDefaultCv, getCvForUser, getCvData, getDefaultEmailAccount, updateEmailAccountTokens,
  createApplication, incrementUsage, getUsage, getDocumentsForAttach,
} from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { isOverLimit } from "@/lib/plans";
import {
  sendViaGmailApi, sendViaSmtp, refreshGoogleAccessToken, resolveCvPath, type Attachment, type SendResult,
} from "@/lib/engine/mailer";
import { buildCoverLetterDocx } from "@/lib/engine/coverletter";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    return await handleSend(req);
  } catch (e: any) {
    // Never leak an HTML 500 page — the client expects JSON.
    await reportError(e, { route: "send" });
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

async function handleSend(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, "send");
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const used = await getUsage(user.id);
  if (isOverLimit(user.plan, used)) {
    return NextResponse.json({ error: "Monthly limit reached.", paywall: true }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const recipients: string[] = (Array.isArray(body?.to) ? body.to : String(body?.to || "").split(/[,;\s]+/))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const subject: string = (body?.subject || "").toString();
  const text: string = (body?.body || "").toString();

  if (!recipients.length) return NextResponse.json({ error: "No recipient email address." }, { status: 400 });
  if (!subject || !text) return NextResponse.json({ error: "Subject or body is empty." }, { status: 400 });

  // Threading: our own Message-ID for this email; optional reply-to a prior application's email.
  const mailDomain = (process.env.NEXT_PUBLIC_BASE_URL || "https://paply.me").replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "paply.me";
  const outMessageId = `<${randomUUID()}@${mailDomain}>`;
  const inReplyTo: string | undefined = body?.inReplyToId ? String(body.inReplyToId) : undefined;
  const threadId: string | null = body?.threadId ? String(body.threadId) : null;
  const recordApplication = body?.recordApplication !== false;
  const ccSelf: boolean = body?.ccSelf === true;

  const profile = await getProfile(user.id);
  const fromName = profile?.fullName || user.name || "Applicant";

  // CV attachment — a specific CV if chosen, else the default.
  const cvId = body?.cvId ? String(body.cvId) : null;
  const cv = (cvId ? await getCvForUser(cvId, user.id) : null) || (await getDefaultCv(user.id));
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

  // Optional extra attachments selected from the user's document library.
  const documentIds: string[] = Array.isArray(body?.documentIds)
    ? body.documentIds.map((s: unknown) => String(s)).filter(Boolean).slice(0, 8)
    : [];
  if (documentIds.length) {
    const docs = await getDocumentsForAttach(documentIds, user.id);
    for (const { doc, bytes } of docs) {
      attachments.push({ filename: doc.filename, content: bytes, mime: doc.mime });
    }
  }

  // Optional cover letter DOCX
  const includeCoverLetter = body?.includeCoverLetter === true;
  let coverLetterAttached = false;
  if (includeCoverLetter) {
    try {
      const applicantName = profile?.fullName || user.name || "Applicant";
      const applicantEmail = profile?.contactEmail || user.email || "";
      const company = (body?.company as string | undefined) || "the company";
      const language = (body?.language as string | undefined) || "en";
      const docxBuf = await buildCoverLetterDocx({ applicantName, applicantEmail, company, body: text, language });
      const safeName = (applicantName.replace(/\s+/g, "_") || "Applicant") + "_cover_letter.docx";
      attachments.push({
        filename: safeName,
        content: docxBuf,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      coverLetterAttached = true;
    } catch (e) {
      console.error("cover letter build failed:", e);
    }
  }

  // Choose sending method
  const account = await getDefaultEmailAccount(user.id);
  let result: SendResult;
  let fromEmail = account?.address || process.env.SMTP_USER || user.email;
  const ccAddresses: string[] | undefined = ccSelf && fromEmail ? [fromEmail] : undefined;

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
      result = { ok: false, error: "Gmail access could not be refreshed. Please reconnect your Gmail." };
    } else {
      result = await sendViaGmailApi({
        accessToken, fromName, fromEmail, to: recipients, cc: ccAddresses, subject, body: text, attachments,
        messageId: outMessageId, inReplyTo, references: inReplyTo, threadId,
      });
    }
  } else if (process.env.SMTP_APP_PASSWORD) {
    fromEmail = process.env.SMTP_USER || fromEmail;
    result = await sendViaSmtp({
      user: fromEmail, pass: process.env.SMTP_APP_PASSWORD, fromName, to: recipients, cc: ccAddresses, subject, body: text, attachments,
      messageId: outMessageId, inReplyTo, references: inReplyTo,
    });
  } else {
    result = { ok: false, error: "No sending method connected — connect your Gmail to send applications." };
  }

  const resultThreadId = result.ok ? (result.threadId ?? threadId) : null;

  // Follow-ups (recordApplication=false) nudge an existing application — no new pipeline row.
  if (recordApplication) {
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
      messageId: result.ok ? outMessageId : null,
      threadId: resultThreadId,
      error: result.ok ? null : result.error,
      sentAt: result.ok ? new Date().toISOString() : null,
    });
  }

  if (result.ok) {
    await incrementUsage(user.id);
    return NextResponse.json({ ok: true, sentTo: recipients, from: fromEmail, cvAttached: attachments.length > 0, coverLetterAttached, threaded: Boolean(inReplyTo || threadId) });
  }
  return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
}
