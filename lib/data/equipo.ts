import type Stripe from "stripe";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getStripe, stripeDisponible } from "@/lib/billing";
import type { RolId } from "@/lib/planes";

export type Miembro = {
  membershipId: string;
  userId: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  role: RolId;
  esYo: boolean;
};

export type Equipo = {
  miUserId: string;
  miMembershipId: string;
  miRol: RolId;
  workspace: { nombre: string; tipo: string };
  plan: string;
  estado: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  suscripcionStripe: boolean; // un abonnement Stripe est rattaché
  suscripcionId: string | null; // id de l'abonnement Stripe vivant (pour résilier)
  cancelAtPeriodEnd: boolean; // résiliation programmée à la fin de période
  billingDisponible: boolean; // STRIPE_SECRET_KEY présente côté serveur
  tarjeta: { brand: string; last4: string } | null; // carte de paiement (admin)
  miembros: Miembro[];
};

const RANK: Record<string, number> = { OWNER: 0, ADMIN: 1, GESTOR: 2, ASISTENTE: 3 };

// Équipe du workspace courant (membre → sa première appartenance). Tout passe par
// le RLS : on ne voit que les membres de ses propres workspaces.
export async function fetchEquipo(): Promise<Equipo | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: myMem } = await supabase
    .from("Membership")
    .select("id, role, workspaceId")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!myMem) return null;
  const ws = (myMem as { workspaceId: string }).workspaceId;

  const [{ data: wsRow }, { data: sub }, { data: mems }] = await Promise.all([
    supabase.from("Workspace").select("nombre, tipo").eq("id", ws).maybeSingle(),
    supabase.from("Subscription").select("*").eq("workspaceId", ws).maybeSingle(),
    supabase.from("Membership").select("id, role, userId, User(nombre, email, avatarUrl)").eq("workspaceId", ws),
  ]);

  type Row = { id: string; role: string; userId: string; User: { nombre: string | null; email: string | null; avatarUrl: string | null } | { nombre: string | null; email: string | null; avatarUrl: string | null }[] | null };
  const miembros: Miembro[] = ((mems as Row[] | null) ?? []).map((m) => {
    const u = Array.isArray(m.User) ? m.User[0] : m.User; // PostgREST one-to-one parfois en tableau
    return {
      membershipId: m.id,
      userId: m.userId,
      nombre: u?.nombre || u?.email || "Usuario",
      email: u?.email || "",
      avatarUrl: u?.avatarUrl ?? null,
      role: m.role as RolId,
      esYo: m.userId === user.id,
    };
  });
  miembros.sort((a, b) => (RANK[a.role] - RANK[b.role]) || a.nombre.localeCompare(b.nombre));

  const s = sub as {
    plan?: string; estado?: string;
    trialEndsAt?: string | null; currentPeriodEnd?: string | null;
    stripeSubscriptionId?: string | null; stripeCustomerId?: string | null;
    cancelAtPeriodEnd?: boolean | null;
  } | null;

  // Carte + état réel de l'abonnement, lus depuis Stripe. Le webhook pouvant être en
  // retard ou mal configuré, on ne dépend pas uniquement des colonnes DB (sinon le
  // bouton « Cancelar suscripción » n'apparaît jamais tant que le webhook n'a pas synchronisé).
  let tarjeta: { brand: string; last4: string } | null = null;
  let suscripcionViva: { id: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null = null;
  if (s?.stripeCustomerId && stripeDisponible()) {
    try {
      const stripe = getStripe();
      const carteDe = (pm: Stripe.PaymentMethod | string | null | undefined) =>
        pm && typeof pm !== "string" && pm.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null;

      // Abonnement vivant (trialing/active/past_due…) directement chez Stripe.
      const subs = await stripe.subscriptions.list({ customer: s.stripeCustomerId, status: "all", limit: 3 });
      const viva = subs.data.find((x) => x.status !== "canceled" && x.status !== "incomplete_expired");
      if (viva) {
        const item = viva.items?.data?.[0];
        const pe = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
          ?? (viva as unknown as { current_period_end?: number }).current_period_end;
        suscripcionViva = { id: viva.id, cancelAtPeriodEnd: Boolean(viva.cancel_at_period_end), currentPeriodEnd: pe ? new Date(pe * 1000).toISOString() : null };
      }

      // Carte en 3 niveaux : invoice_settings → subscription.default_payment_method → paymentMethods.list.
      const cust = await stripe.customers.retrieve(s.stripeCustomerId, { expand: ["invoice_settings.default_payment_method"] });
      tarjeta = carteDe((cust as Stripe.Customer).invoice_settings?.default_payment_method as Stripe.PaymentMethod | null);
      const subId = suscripcionViva?.id ?? s.stripeSubscriptionId;
      if (!tarjeta && subId) {
        const sp = await stripe.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
        tarjeta = carteDe(sp.default_payment_method as Stripe.PaymentMethod | null);
      }
      if (!tarjeta) {
        const pms = await stripe.paymentMethods.list({ customer: s.stripeCustomerId, type: "card", limit: 1 });
        tarjeta = carteDe(pms.data[0]);
      }
    } catch (e) {
      // Stripe non lisible (id d'un autre mode, customer supprimé…) → on n'affiche rien.
      console.warn("[equipo] Stripe no legible para", s.stripeCustomerId, e instanceof Error ? e.message : e);
    }
  }

  return {
    miUserId: user.id,
    miMembershipId: (myMem as { id: string }).id,
    miRol: (myMem as { role: string }).role as RolId,
    workspace: (wsRow as { nombre: string; tipo: string } | null) ?? { nombre: "Mi despacho", tipo: "GESTORIA" },
    plan: s?.plan ?? "STARTER",
    estado: s?.estado ?? "TRIAL",
    trialEndsAt: s?.trialEndsAt ?? null,
    currentPeriodEnd: suscripcionViva?.currentPeriodEnd ?? s?.currentPeriodEnd ?? null,
    suscripcionStripe: Boolean(suscripcionViva) || Boolean(s?.stripeSubscriptionId),
    suscripcionId: suscripcionViva?.id ?? s?.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: suscripcionViva ? suscripcionViva.cancelAtPeriodEnd : Boolean(s?.cancelAtPeriodEnd),
    billingDisponible: Boolean(process.env.STRIPE_SECRET_KEY),
    tarjeta,
    miembros,
  };
}
