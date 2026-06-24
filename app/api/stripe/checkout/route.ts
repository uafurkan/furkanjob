import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setUserPlan, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Real Stripe Checkout when configured; otherwise a dev stub that upgrades locally so the
// gating/flow is testable without keys. Production must use the real path.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_PRO;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (key && price) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: user.email,
      success_url: `${base}/app/billing?upgraded=1`,
      cancel_url: `${base}/app/billing`,
      metadata: { userId: user.id },
    });
    return NextResponse.json({ url: session.url });
  }

  // --- dev stub ---
  await setUserPlan(user.id, "pro");
  await upsertSubscription(user.id, { plan: "pro", status: "active_dev_stub" });
  return NextResponse.json({ stub: true, url: `${base}/app/billing?upgraded=1` });
}
