import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { updateApplicationStatus } from "@/lib/db";
import { SETTABLE_STATUSES } from "@/lib/applications";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const status = String(body?.status || "");
  if (!(SETTABLE_STATUSES as string[]).includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  await updateApplicationStatus(params.id, user.id, status);
  return NextResponse.json({ ok: true, status });
}
