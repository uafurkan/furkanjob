import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addCv, listCvs, setDefaultCv, deleteCv } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cvs = await listCvs(user.id);
  return NextResponse.json({
    cvs: cvs.map((c) => ({ id: c.id, filename: c.filename, size: c.size, isDefault: c.isDefault })),
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await setDefaultCv(id, user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteCv(id, user.id);
  return NextResponse.json({ ok: true });
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

    return NextResponse.json({ ok: true, cv: { id: cv.id, filename: cv.filename, size: cv.size, isDefault: cv.isDefault } });
  } catch (error: any) {
    console.error("CV upload error:", error);
    return NextResponse.json({ error: error.message || "CV upload failed" }, { status: 500 });
  }
}
