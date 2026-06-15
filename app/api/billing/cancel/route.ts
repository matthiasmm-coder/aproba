import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, stripeDisponible } from "@/lib/billing";
import { puedeGestionarEquipo } from "@/lib/planes";

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Résilier (à la fin de période) ou réactiver l'abonnement Stripe du despacho.
// Réservé aux administrateurs. Body : { accion: "cancelar" | "reactivar" }.
export async function POST(req: Request) {
  if (!stripeDisponible()) return fail("La facturación no está configurada.", 503);

  const body = (await req.json().catch(() => ({}))) as { accion?: string };
  const reactivar = body.accion === "reactivar";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin
    .from("Membership")
    .select("workspaceId, role")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return fail("No perteneces a ningún despacho.", 403);
  if (!puedeGestionarEquipo(mem.role as string)) return fail("Solo un administrador puede gestionar la suscripción.", 403);

  const { data: sub } = await admin.from("Subscription").select("stripeSubscriptionId, stripeCustomerId").eq("workspaceId", mem.workspaceId as string).maybeSingle();

  // Id de l'abonnement : colonne DB, sinon on le retrouve chez Stripe (webhook en retard / mal configuré).
  let subId = (sub?.stripeSubscriptionId as string | null) ?? null;
  if (!subId && sub?.stripeCustomerId) {
    try {
      const lista = await getStripe().subscriptions.list({ customer: sub.stripeCustomerId as string, status: "all", limit: 3 });
      subId = lista.data.find((x) => x.status !== "canceled" && x.status !== "incomplete_expired")?.id ?? null;
    } catch { /* on tombe sur le 409 ci-dessous */ }
  }
  if (!subId) return fail("Este despacho no tiene una suscripción activa.", 409);

  // Résiliation douce : l'accès reste jusqu'à la fin de la période déjà payée.
  let actualizada;
  try {
    actualizada = await getStripe().subscriptions.update(subId, {
      cancel_at_period_end: !reactivar,
    });
  } catch (e) {
    // Abonnement d'un autre mode Stripe (live↔test) ou inexistant → erreur actionnable.
    console.error("[billing/cancel]", e instanceof Error ? e.message : e);
    return fail("No se pudo actualizar la suscripción: no existe en este entorno de Stripe.", 409);
  }

  // Persiste tout de suite (sans attendre le webhook) pour un UI cohérent + rattrape
  // l'id de l'abonnement si la colonne DB était vide (webhook en retard).
  await admin.from("Subscription").update({ cancelAtPeriodEnd: !reactivar, stripeSubscriptionId: subId }).eq("workspaceId", mem.workspaceId as string);

  const item = actualizada.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const legacy = (actualizada as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = item?.current_period_end ?? legacy;
  return NextResponse.json({
    ok: true,
    cancelAtPeriodEnd: !reactivar,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });
}
