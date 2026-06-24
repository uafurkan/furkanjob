import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { setUserPlan, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Admin-only: manually set a user's plan (comp / revoke Pro).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdminEmail(me.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const userId = (b.userId || "").toString();
  const plan = b.plan === "pro" ? "pro" : "free";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await setUserPlan(userId, plan);
  await upsertSubscription(userId, { plan, status: plan === "pro" ? "admin_comp" : "admin_revoked" });
  return NextResponse.json({ ok: true, plan });
}
