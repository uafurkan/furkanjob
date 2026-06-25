// Sending layer. Primary: Gmail API (user's connected inbox, OAuth). Fallback: SMTP (App Password).
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

export type Attachment = { filename: string; absPath?: string; content?: Buffer; mime?: string };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Build an RFC822 message (multipart/mixed when there are attachments).
export function buildMime(opts: {
  fromName: string;
  fromEmail: string;
  to: string[];
  subject: string;
  body: string;
  attachments?: Attachment[];
  messageId?: string;   // our own Message-ID (so follow-ups can reference it)
  inReplyTo?: string;   // the original Message-ID this is a reply to
  references?: string;  // thread references chain
}): string {
  const { fromName, fromEmail, to, subject, body, attachments = [], messageId, inReplyTo, references } = opts;
  // RFC 2047 encode the subject so non-ASCII (e.g. Hülako) survives.
  const encSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const headersBase = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to.join(", ")}`,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
  ];
  if (messageId) headersBase.push(`Message-ID: ${messageId}`);
  if (inReplyTo) headersBase.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headersBase.push(`References: ${references}`);

  if (!attachments.length) {
    return [
      ...headersBase,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");
  }

  const boundary = "atfm_" + Math.random().toString(36).slice(2);
  const parts: string[] = [
    ...headersBase,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ];
  for (const a of attachments) {
    const data = a.content ?? fs.readFileSync(a.absPath!);
    const mime = a.mime || "application/octet-stream";
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mime}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      data.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      ""
    );
  }
  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

// Refresh a Google access token from a stored refresh token.
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

export type SendResult = { ok: true; messageId: string; threadId?: string | null } | { ok: false; error: string };

export async function sendViaGmailApi(opts: {
  accessToken: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  subject: string;
  body: string;
  attachments?: Attachment[];
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string | null; // append to an existing Gmail thread
}): Promise<SendResult> {
  const { accessToken, threadId, ...mimeOpts } = opts;
  const raw = b64url(Buffer.from(buildMime(mimeOpts), "utf8"));
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Gmail API ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string; threadId?: string };
    return { ok: true, messageId: data.id || "sent", threadId: data.threadId || null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "gmail send failed" };
  }
}

export async function sendViaSmtp(opts: {
  user: string;
  pass: string;
  fromName: string;
  to: string[];
  subject: string;
  body: string;
  attachments?: Attachment[];
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<SendResult> {
  try {
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user: opts.user, pass: opts.pass } });
    const info = await transport.sendMail({
      from: `${opts.fromName} <${opts.user}>`,
      to: opts.to.join(", "),
      subject: opts.subject,
      text: opts.body,
      messageId: opts.messageId,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
      attachments: (opts.attachments || []).map((a) =>
        a.content ? { filename: a.filename, content: a.content } : { filename: a.filename, path: a.absPath }
      ),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "smtp send failed" };
  }
}

export function resolveCvPath(storageKey: string): string {
  // dev: storageKey is a path relative to project root or absolute
  return path.isAbsolute(storageKey) ? storageKey : path.join(process.cwd(), storageKey);
}
