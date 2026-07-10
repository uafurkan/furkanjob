import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getCvForUser } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cv = await getCvForUser(id, user.id);
  if (!cv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = cv as any;
  const dataB64: string | null = row.data ?? null;
  if (!dataB64) return NextResponse.json({ error: "no file data" }, { status: 404 });

  const buf = Buffer.from(dataB64, "base64");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": cv.mime || "application/pdf",
      "Content-Disposition": `attachment; filename="${cv.filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
