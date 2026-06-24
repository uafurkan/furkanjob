import { NextResponse } from "next/server";
import { findUserById, findUserByStripeCustomerId, setUserPlan, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Stripe webhook → keep plan/subscription in sync. No-op when Stripe isn't configured.
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

  async function resolveUserId(obj: any): Promise<string | null> {
    const uid = obj?.metadata?.userId || obj?.subscription_details?.metadata?.userId || obj?.client_reference_id;
    if (uid && (await findUserById(uid))) return uid;
    const customer = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
    if (customer) {
      const u = await findUserByStripeCustomerId(customer);
      if (u) return u.id;
    }
    return null;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const userId = await resolveUserId(s);
        if (userId) {
          await setUserPlan(userId, "pro");
          await upsertSubscription(userId, { plan: "pro", status: "active", stripeSubId: s.subscription });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        const userId = await resolveUserId(sub);
        const active = sub.status === "active" || sub.status === "trialing";
        if (userId) {
          await setUserPlan(userId, active ? "pro" : "free");
          await upsertSubscription(userId, {
            plan: active ? "pro" : "free",
            status: sub.status,
            stripeSubId: sub.id,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = await resolveUserId(sub);
        if (userId) {
          await setUserPlan(userId, "free");
          await upsertSubscription(userId, { plan: "free", status: "canceled", stripeSubId: sub.id });
        }
        break;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
