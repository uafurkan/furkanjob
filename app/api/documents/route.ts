import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addDocument, listDocuments, deleteDocument } from "@/lib/db";
import type { Document } from "@/lib/types";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Document library: certificates, diplomas, experience letters, and other supporting files.
// (The visa proof is managed separately via /api/visa.)
const LIBRARY_TYPES: Document["type"][] = ["certificate", "diploma", "experience", "other"];

function isLibraryType(v: unknown): v is Document["type"] {
  return typeof v === "string" && (LIBRARY_TYPES as string[]).includes(v);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const docs = (await listDocuments(user.id)).filter((d) => d.type !== "visa");
  return NextResponse.json({ documents: docs });
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "upload");
    if (!rl.ok) return NextResponse.json({ error: "Çok fazla yükleme. Biraz bekleyin." }, { status: 429 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const typeRaw = form?.get("type");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Dosya yok." }, { status: 400 });
    const type: Document["type"] = isLibraryType(typeRaw) ? typeRaw : "other";

    const f = file as File;
    if (f.size > 10_000_000) return NextResponse.json({ error: "Dosya çok büyük (max 10MB)." }, { status: 413 });
    const buf = Buffer.from(await f.arrayBuffer());
    const safeName = f.name.replace(/[^\w.\-]+/g, "_") || "document";

    const doc = await addDocument({
      userId: user.id,
      type,
      filename: safeName,
      mime: f.type || "application/octet-stream",
      size: buf.length,
      dataB64: buf.toString("base64"),
    });

    return NextResponse.json({ ok: true, document: { id: doc.id, type: doc.type, filename: doc.filename, size: doc.size, createdAt: doc.createdAt } });
  } catch (e: any) {
    console.error("document upload error:", e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteDocument(id, user.id);
  return NextResponse.json({ ok: true });
}
