import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setUserPlan, setUserStripeCustomer, upsertSubscription } from "@/lib/db";

export const runtime = "nodejs";

// Production Stripe Checkout (subscription). Apple Pay & Google Pay appear automatically in Checkout
// on supported devices/browsers once the domain is registered in the Stripe dashboard. Card data
// never touches our servers. Falls back to a dev stub (local upgrade) when keys aren't configured.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_PRO;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (key && price) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);

    // Reuse or create the Stripe customer for this user.
    let customerId = user.stripeCustomerId || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
      customerId = customer.id;
      await setUserStripeCustomer(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      // payment_method_types omitted → Stripe enables cards + wallets (Apple/Google Pay) automatically
      success_url: `${base}/app/billing?upgraded=1`,
      cancel_url: `${base}/app/billing`,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
    });
    return NextResponse.json({ url: session.url });
  }

  // --- dev stub (no keys) ---
  await setUserPlan(user.id, "pro");
  await upsertSubscription(user.id, { plan: "pro", status: "active_dev_stub" });
  return NextResponse.json({ stub: true, url: `${base}/app/billing?upgraded=1` });
}
