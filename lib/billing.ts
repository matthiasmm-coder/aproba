import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRECIO_EXPEDIENTE_EXTRA, type PlanId } from "@/lib/planes";

// Facturation SaaS (abonnement du despacho à Aproba) via Stripe.
// Tout est conçu en « repli propre » : sans STRIPE_SECRET_KEY, l'app garde le
// comportement actuel (prueba gratuita, plan stocké en DB, aucun cobro réel).
// Les precios Stripe se résolvent par lookup_key (créés par scripts/stripe-setup.mjs),
// pas par des IDs en dur dans le code.

// Clé Stripe nettoyée : un retour-ligne / espace / guillemets collé par erreur dans
// la variable d'env casse l'en-tête HTTP d'auth → "connection error". On défend.
const stripeKey = () => (process.env.STRIPE_SECRET_KEY ?? "").trim().replace(/^["']|["']$/g, "");
export const stripeDisponible = () => Boolean(stripeKey());

let cliente: Stripe | null = null;
let claveCacheada = "";
export function getStripe(): Stripe {
  const key = stripeKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY no está configurada — la facturación real está desactivada.");
  }
  // Recrée le client si la clé a changé (bascule test↔live) et purge le cache de
  // precios : les price ids dépendent du mode, les réutiliser donnerait "No such price".
  if (!cliente || key !== claveCacheada) {
    cliente = new Stripe(key, { maxNetworkRetries: 2 });
    claveCacheada = key;
    precios.clear();
    ivaCacheado = null;
  }
  return cliente;
}

// IVA 21 % « exclusive » (los precios de la landing son SIN IVA, «/mes + IVA»).
// Auto-provisionado como ensureCustomer: se busca por metadata y, si el modo
// (test/live) todavía no lo tiene, se crea — nada que pegar a mano en el dashboard.
// ⚠️ Tipo fijo peninsular/Baleares. Canarias/Ceuta/Melilla (IGIC/IPSI, no sujeto
// a IVA): al convertir un cliente de allí, quitarle default_tax_rates a SU
// suscripción en el dashboard (o pasar a Stripe Tax).
let ivaCacheado: string | null = null;
export async function tasaIva(): Promise<string> {
  if (ivaCacheado) return ivaCacheado;
  const stripe = getStripe();
  const existentes = await stripe.taxRates.list({ active: true, limit: 100 });
  const iva = existentes.data.find(
    (t) => t.metadata?.app === "aproba" && t.percentage === 21 && !t.inclusive,
  ) ?? await stripe.taxRates.create({
    display_name: "IVA",
    percentage: 21,
    inclusive: false,
    country: "ES",
    description: "IVA 21% (España peninsular y Baleares)",
    metadata: { app: "aproba" },
  });
  ivaCacheado = iva.id;
  return iva.id;
}

// Garantit un customer Stripe valide DANS LE MODE COURANT (test vs live).
// Un id 'cus_…' créé en live n'existe pas en test (et inversement) ; un customer
// supprimé revient en { deleted:true } sans lever. Dans les deux cas on en recrée
// un et on renvoie { id, recreado } pour que l'appelant réécrive la DB.
export async function ensureCustomer(datos: {
  id?: string | null;
  email?: string | null;
  name?: string;
  workspaceId: string;
}): Promise<{ id: string; recreado: boolean }> {
  const stripe = getStripe();
  if (datos.id) {
    try {
      const c = await stripe.customers.retrieve(datos.id);
      if (!(c as { deleted?: boolean }).deleted) return { id: datos.id, recreado: false };
    } catch (e) {
      // resource_missing = id d'un autre mode / inexistant → on recrée plus bas.
      if ((e as { code?: string }).code !== "resource_missing") throw e;
    }
  }
  const c = await stripe.customers.create(
    { email: datos.email ?? undefined, name: datos.name, metadata: { workspaceId: datos.workspaceId } },
    { idempotencyKey: `cust_${datos.workspaceId}` },
  );
  return { id: c.id, recreado: true };
}

// lookup_key Stripe ↔ plan Aproba (montants gérés côté Stripe par le setup script).
// Anual = 10 × mensual (« 2 meses gratis », comme la landing).
export type Intervalo = "mensual" | "anual";
export const PLAN_LOOKUP: Record<PlanId, string> = {
  STARTER: "aproba_starter_mensual",
  PRO: "aproba_pro_mensual",
  BUSINESS: "aproba_business_mensual",
};
export const PLAN_LOOKUP_ANUAL: Record<PlanId, string> = {
  STARTER: "aproba_starter_anual",
  PRO: "aproba_pro_anual",
  BUSINESS: "aproba_business_anual",
};
export const LOOKUP_PLAN: Record<string, PlanId> = {
  aproba_starter_mensual: "STARTER",
  aproba_pro_mensual: "PRO",
  aproba_business_mensual: "BUSINESS",
  aproba_starter_anual: "STARTER",
  aproba_pro_anual: "PRO",
  aproba_business_anual: "BUSINESS",
};

// Cache module : lookup_key → price id (une seule liste par process).
const precios = new Map<string, string>();
export async function precioDePlan(plan: PlanId, intervalo: Intervalo = "mensual"): Promise<string> {
  const lk = intervalo === "anual" ? PLAN_LOOKUP_ANUAL[plan] : PLAN_LOOKUP[plan];
  if (!precios.has(lk)) {
    const res = await getStripe().prices.list({
      lookup_keys: [...Object.values(PLAN_LOOKUP), ...Object.values(PLAN_LOOKUP_ANUAL)],
      limit: 20,
    });
    for (const p of res.data) if (p.lookup_key) precios.set(p.lookup_key, p.id);
  }
  const id = precios.get(lk);
  if (!id) throw new Error(`No existe el precio Stripe '${lk}'. Ejecuta: node scripts/stripe-setup.mjs`);
  return id;
}

// Cobro de un expediente POR ENCIMA del límite mensual del plan: añade una línea de
// PRECIO_EXPEDIENTE_EXTRA € a la PRÓXIMA factura de la suscripción del despacho (invoice
// item pendiente → Stripe lo adjunta al cierre del ciclo). Idempotente por expedienteId:
// un reintento con la misma clave NO duplica el cargo. El llamador ya filtró prueba/plan.
export async function cobrarExpedienteExtra(opts: {
  customerId: string;
  expedienteId: string;
  referencia: string;
}): Promise<string> {
  const it = await getStripe().invoiceItems.create(
    {
      customer: opts.customerId,
      amount: Math.round(PRECIO_EXPEDIENTE_EXTRA * 100), // céntimos, SIN IVA (landing: «después 3 €/expediente» bajo «Precios sin IVA»)
      currency: "eur",
      description: `Expediente extra ${opts.referencia} (por encima del límite del plan)`,
      metadata: { expedienteId: opts.expedienteId },
      tax_rates: [await tasaIva()],
    },
    { idempotencyKey: `ov_${opts.expedienteId}` },
  );
  return it.id;
}

// status Stripe → enum SubscriptionEstado.
export function mapEstadoStripe(status: string): "TRIAL" | "ACTIVA" | "PAST_DUE" | "CANCELADA" {
  if (status === "trialing") return "TRIAL";
  if (status === "active") return "ACTIVA";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "PAST_DUE";
  return "CANCELADA"; // canceled, incomplete_expired, paused
}

// Champs à synchroniser en DB depuis un objet Subscription Stripe.
// current_period_end vit sur l'item depuis l'API « basil » (2025) — on lit les deux.
export function patchDesdeStripe(sub: Stripe.Subscription): Record<string, unknown> {
  const item = sub.items?.data?.[0];
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ?? legacy;
  const lookup = item?.price?.lookup_key ?? "";
  const cancelado = sub.status === "canceled" || sub.status === "incomplete_expired";
  return {
    estado: mapEstadoStripe(sub.status),
    // une suscripción anulada ne doit plus bloquer un nouveau checkout
    stripeSubscriptionId: cancelado ? null : sub.id,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), // résiliation programmée à la fin de période
    ...(LOOKUP_PLAN[lookup] ? { plan: LOOKUP_PLAN[lookup] } : {}),
    ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000).toISOString() } : {}),
    ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000).toISOString() } : {}),
  };
}

// Réparation à la volée du décalage webhook. Le retour de Stripe Checkout renvoie
// l'utilisateur dans l'app AVANT que `customer.subscription.created` ne soit forcément
// livré : la DB n'a alors pas encore `stripeSubscriptionId`, le garde du layout croit
// l'essai expiré et le renvoie sur l'écran de paiement qu'il vient de régler.
// Ici on demande la vérité directement à Stripe et on écrit le MÊME patch que le
// webhook (patchDesdeStripe), donc aucune divergence de sémantique possible.
// Best-effort : ne lance jamais, retourne false si rien à réparer.
export async function reconciliarSuscripcion(
  admin: SupabaseClient,
  workspaceId: string,
  customerId: string,
): Promise<boolean> {
  if (!stripeDisponible() || !customerId) return false;
  try {
    const stripe = getStripe();
    const lista = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    // Une souscription « morte » ne doit pas rouvrir l'accès : on ne retient que
    // celles qui donnent droit au service (trialing inclus — le plancher de 48 h).
    const viva = lista.data.find((s) =>
      ["trialing", "active", "past_due", "unpaid"].includes(s.status),
    );
    if (!viva) return false;
    const { error } = await admin.from("Subscription").update(patchDesdeStripe(viva)).eq("workspaceId", workspaceId);
    if (error) {
      console.error("[reconciliar] escritura:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[reconciliar]", e instanceof Error ? e.message : e);
    return false;
  }
}
