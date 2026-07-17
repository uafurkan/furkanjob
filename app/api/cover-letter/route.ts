import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { upsertCountryCoverLetter, listCountryCoverLetters, deleteCountryCoverLetter } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cls = await listCountryCoverLetters(user.id);
  return NextResponse.json({
    coverLetters: cls.map((c) => ({ id: c.id, countryCode: c.countryCode, filename: c.filename, size: c.size })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit(user.id, "upload");
  if (!rl.ok) return NextResponse.json({ error: "Too many uploads." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const countryCode = form?.get("countryCode");
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!countryCode || typeof countryCode !== "string") return NextResponse.json({ error: "countryCode required" }, { status: 400 });

  const f = file as File;
  const buf = Buffer.from(await f.arrayBuffer());
  const safeName = f.name.replace(/[^\w.\-]+/g, "_") || "cover_letter.docx";
  const cl = await upsertCountryCoverLetter({
    userId: user.id,
    countryCode: countryCode.toUpperCase().slice(0, 5),
    filename: safeName,
    mime: f.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: buf.length,
    dataB64: buf.toString("base64"),
  });
  return NextResponse.json({ ok: true, coverLetter: { id: cl.id, countryCode: cl.countryCode, filename: cl.filename } });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clId = new URL(req.url).searchParams.get("id");
  if (!clId) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteCountryCoverLetter(clId, user.id);
  return NextResponse.json({ ok: true });
}
