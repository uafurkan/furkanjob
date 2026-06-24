import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setUserPlan, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Stripe Billing Portal — manage/cancel subscription, update payment method. Dev stub downgrades.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (key && user.stripeCustomerId) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/app/billing`,
    });
    return NextResponse.json({ url: session.url });
  }

  // --- dev stub: toggle back to free ---
  await setUserPlan(user.id, "free");
  await upsertSubscription(user.id, { plan: "free", status: "canceled_dev_stub" });
  return NextResponse.json({ stub: true, url: `${base}/app/billing` });
}
