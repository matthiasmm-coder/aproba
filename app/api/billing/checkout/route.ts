import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, precioDePlan, stripeDisponible, ensureCustomer } from "@/lib/billing";
import { baseUrlFromRequest } from "@/lib/base-url";
import { puedeGestionarEquipo, type PlanId } from "@/lib/planes";

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Démarre l'abonnement Stripe du despacho (Checkout hébergé, mode subscription).
// Le plan facturé = le plan actuel de la Subscription (choisi à l'onboarding ou
// dans Ajustes). S'il reste des jours d'essai, ils sont conservés (trial_end).
export async function POST(req: Request) {
  if (!stripeDisponible()) return fail("La facturación todavía no está configurada en este entorno.", 503);

  // Destination de retour (par défaut Ajustes ; l'onboarding passe "/app").
  const body = (await req.json().catch(() => ({}))) as { volverA?: string; intervalo?: string };
  const volverA = typeof body.volverA === "string" && body.volverA.startsWith("/") ? body.volverA : "/app/ajustes";
  // Ciclo de facturación elegido por el usuario (anual = «2 meses gratis» de la landing).
  const intervalo = body.intervalo === "anual" ? "anual" : "mensual";

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

  try {
    const stripe = getStripe();

    // Customer Stripe valide dans le mode courant : un id stocké venant d'un autre
    // mode (live↔test) ou supprimé est recréé, et on réécrit la DB le cas échéant.
    const { id: customerId, recreado } = await ensureCustomer({
      id: sub.stripeCustomerId,
      email: user.email,
      name: wsNombre,
      workspaceId: ws,
    });
    if (recreado) {
      await admin.from("Subscription").update({ stripeCustomerId: customerId }).eq("workspaceId", ws);
    }

    const price = await precioDePlan((sub.plan as PlanId) ?? "STARTER", intervalo);

    // Conserver les jours d'essai restants (carte non débitée avant la fin de l'essai).
    // Stripe rejette un trial_end à moins de ~48 h dans le futur → on défend.
    const MIN_TRIAL_MS = 48 * 60 * 60 * 1000;
    const restanteMs = sub.trialEndsAt ? Date.parse(sub.trialEndsAt as string) - Date.now() : 0;
    let trialEnd: number | undefined;
    if (restanteMs >= MIN_TRIAL_MS) {
      trialEnd = Math.floor(Date.parse(sub.trialEndsAt as string) / 1000);
    } else if (sub.estado === "TRIAL") {
      // Essai DB (presque) écoulé mais despacho encore en TRIAL : on accorde un plancher
      // de 48 h pour ne pas débiter par surprise une carte qu'on vient d'ajouter.
      trialEnd = Math.floor((Date.now() + MIN_TRIAL_MS) / 1000);
    }

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
    }, {
      // Évite deux sessions sur un double-clic dans la même minute.
      idempotencyKey: `co_${ws}_${sub.plan}_${intervalo}_${Math.floor(Date.now() / 60000)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Surface la vraie cause (ex. precio Stripe inexistant → setup live non lancé).
    const msg = e instanceof Error ? e.message : "Error de Stripe";
    console.error("[billing/checkout]", msg);
    return fail(`No se pudo iniciar el pago: ${msg}`, 502);
  }
}
