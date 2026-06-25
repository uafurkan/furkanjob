import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { updateApplicationStatus, updateApplicationNotes, deleteApplication } from "@/lib/db";
import { SETTABLE_STATUSES } from "@/lib/applications";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (typeof body?.notes === "string") {
    await updateApplicationNotes(params.id, user.id, body.notes.slice(0, 2000));
    return NextResponse.json({ ok: true });
  }

  const status = String(body?.status || "");
  if (!(SETTABLE_STATUSES as string[]).includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  await updateApplicationStatus(params.id, user.id, status);
  return NextResponse.json({ ok: true, status });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteApplication(params.id, user.id);
  return NextResponse.json({ ok: true });
}
