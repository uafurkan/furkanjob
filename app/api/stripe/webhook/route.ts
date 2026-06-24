import { NextResponse } from "next/server";
import { findUserByEmail, setUserPlan, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Stripe webhook → reflect subscription state. No-op when Stripe isn't configured.
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) return NextResponse.json({ received: true, stub: true });

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook signature: ${e.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated") {
    const obj = event.data.object;
    const email = obj.customer_email || obj.customer_details?.email;
    const status = obj.status || "active";
    const plan = status === "active" || status === "trialing" ? "pro" : "free";
    if (email) {
      const u = await findUserByEmail(email);
      if (u) {
        await setUserPlan(u.id, plan as any);
        await upsertSubscription(u.id, { plan: plan as any, status, stripeSubId: obj.subscription || obj.id });
      }
    }
  }
  return NextResponse.json({ received: true });
}
