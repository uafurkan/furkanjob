import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addCv, getDefaultCv } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cv = await getDefaultCv(user.id);
  return NextResponse.json({ cv: cv ? { filename: cv.filename, size: cv.size } : null });
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "upload");
    if (!rl.ok) return NextResponse.json({ error: "Çok fazla yükleme. Biraz bekleyin." }, { status: 429 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Dosya yok." }, { status: 400 });

    const f = file as File;
    const buf = Buffer.from(await f.arrayBuffer());
    const safeName = f.name.replace(/[^\w.\-]+/g, "_") || "cv.pdf";

    // Store bytes in the DB — serverless filesystems are read-only / ephemeral.
    const cv = await addCv({
      userId: user.id,
      filename: safeName,
      storageKey: `db:${user.id}/${Date.now()}-${safeName}`,
      mime: f.type || "application/pdf",
      size: buf.length,
      dataB64: buf.toString("base64"),
      isDefault: true,
    });

    return NextResponse.json({ ok: true, cv: { filename: cv.filename, size: cv.size } });
  } catch (error: any) {
    console.error("CV upload error:", error);
    return NextResponse.json({ error: error.message || "CV upload failed" }, { status: 500 });
  }
}
