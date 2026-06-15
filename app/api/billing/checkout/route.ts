import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, precioDePlan, stripeDisponible } from "@/lib/billing";
import { baseUrlFromRequest } from "@/lib/base-url";
import { puedeGestionarEquipo, type PlanId } from "@/lib/planes";

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Démarre l'abonnement Stripe du despacho (Checkout hébergé, mode subscription).
// Le plan facturé = le plan actuel de la Subscription (choisi à l'onboarding ou
// dans Ajustes). S'il reste des jours d'essai, ils sont conservés (trial_end).
export async function POST(req: Request) {
  if (!stripeDisponible()) return fail("La facturación todavía no está configurada en este entorno.", 503);

  // Destination de retour (par défaut Ajustes ; l'onboarding passe "/app").
  const body = (await req.json().catch(() => ({}))) as { volverA?: string };
  const volverA = typeof body.volverA === "string" && body.volverA.startsWith("/") ? body.volverA : "/app/ajustes";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin
    .from("Membership")
    .select("workspaceId, role, Workspace(nombre)")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return fail("No perteneces a ningún despacho.", 403);
  if (!puedeGestionarEquipo(mem.role as string)) return fail("Solo un administrador puede activar la suscripción.", 403);
  const ws = mem.workspaceId as string;
  const wsNombre = (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace)?.nombre ?? "Despacho";

  const { data: sub } = await admin.from("Subscription").select("*").eq("workspaceId", ws).maybeSingle();
  if (!sub) return fail("No se encontró la suscripción del despacho.", 404);
  if (sub.stripeSubscriptionId) return fail("Este despacho ya tiene una suscripción activa. Usa «Gestionar facturación».", 409);

  const stripe = getStripe();

  // Customer Stripe (réutilisé entre tentatives de checkout).
  let customerId: string = sub.stripeCustomerId ?? "";
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: wsNombre,
      metadata: { workspaceId: ws },
    });
    customerId = customer.id;
    await admin.from("Subscription").update({ stripeCustomerId: customerId }).eq("workspaceId", ws);
  }

  const price = await precioDePlan((sub.plan as PlanId) ?? "STARTER");

  // Conserver les jours d'essai restants (la carte n'est débitée qu'à la fin).
  const trialMs = sub.trialEndsAt ? Date.parse(sub.trialEndsAt as string) - Date.now() : 0;
  const trialEnd = trialMs > 120_000 ? Math.floor(Date.parse(sub.trialEndsAt as string) / 1000) : undefined;

  const origin = baseUrlFromRequest(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: {
      metadata: { workspaceId: ws },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    allow_promotion_codes: true,
    success_url: `${origin}${volverA}?billing=ok`,
    cancel_url: `${origin}${volverA}?billing=cancelado`,
  });

  return NextResponse.json({ url: session.url });
}
