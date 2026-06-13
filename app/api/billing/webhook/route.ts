import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, patchDesdeStripe } from "@/lib/billing";

// Webhook Stripe — source de vérité de l'état de l'abonnement.
// Vérification de signature obligatoire ; mises à jour idempotentes (on écrit
// l'état courant, rejouer un événement ne change rien).
export async function POST(req: Request) {
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  const firma = req.headers.get("stripe-signature");
  if (!whsec || !firma) return NextResponse.json({ error: "webhook no configurado" }, { status: 400 });

  const cuerpo = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(cuerpo, firma, whsec);
  } catch {
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const admin = createSupabaseAdmin();
    const patch = patchDesdeStripe(sub);
    const ws = sub.metadata?.workspaceId;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

    const query = admin.from("Subscription").update(patch);
    const { error } = ws
      ? await query.eq("workspaceId", ws)
      : await query.eq("stripeCustomerId", customerId ?? "—");
    if (error) {
      console.error("[stripe webhook]", event.type, error.message);
      // 500 → Stripe réessaiera (livraison garantie plutôt que perte silencieuse)
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
