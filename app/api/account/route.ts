import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { exportUserData, deleteUserData } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

// GDPR/KVKK: export everything we hold about the user as a JSON download.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "account");
    if (!rl.ok) return NextResponse.json({ error: "Çok fazla istek. Biraz bekleyin." }, { status: 429 });

    const data = await exportUserData(user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="paply-data-${user.id}.json"`,
      },
    });
  } catch (e: any) {
    await reportError(e, { route: "account/export" });
    return NextResponse.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}

// GDPR/KVKK: permanently delete the account and all associated data.
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(user.id, "account");
    if (!rl.ok) return NextResponse.json({ error: "Çok fazla istek. Biraz bekleyin." }, { status: 429 });

    await deleteUserData(user.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await reportError(e, { route: "account/delete" });
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
