import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addCv, getDefaultCv } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

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

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Dosya yok." }, { status: 400 });

    const f = file as File;
    const buf = Buffer.from(await f.arrayBuffer());
    const safeName = f.name.replace(/[^\w.\-]+/g, "_") || "cv.pdf";

    const dir = path.join(process.cwd(), "storage", "cv", user.id);
    fs.mkdirSync(dir, { recursive: true });
    const storageKey = path.join("storage", "cv", user.id, `${Date.now()}-${safeName}`);
    fs.writeFileSync(path.join(process.cwd(), storageKey), buf);

    const cv = await addCv({
      userId: user.id,
      filename: safeName,
      storageKey,
      mime: f.type || "application/pdf",
      size: buf.length,
      isDefault: true,
    });

    return NextResponse.json({ ok: true, cv: { filename: cv.filename, size: cv.size } });
  } catch (error: any) {
    console.error("CV upload error:", error);
    return NextResponse.json({ error: error.message || "CV upload failed" }, { status: 500 });
  }
}
