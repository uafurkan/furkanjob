// AES-256-GCM encryption for OAuth tokens at rest. Key derived from TOKEN_ENC_KEY.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.TOKEN_ENC_KEY || "dev-token-encryption-key-fallback";
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encrypt(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivB, tagB, dataB] = payload.split(":");
    if (!ivB || !tagB || !dataB) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
