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

  // Carte de paiement (marque + 4 derniers chiffres) — lecture robuste en 3 niveaux :
  //  1) customer.invoice_settings.default_payment_method (cobro recurrente fijado)
  //  2) subscription.default_payment_method (cas essai : Stripe la laisse ici, pas sur le customer)
  //  3) paymentMethods.list (toute carte rattachée au customer)
  // Customer absent du mode Stripe courant (live↔test) ou supprimé → catch → on n'affiche rien.
  let tarjeta: { brand: string; last4: string } | null = null;
  if (s?.stripeCustomerId && stripeDisponible()) {
    try {
      const stripe = getStripe();
      const carteDe = (pm: Stripe.PaymentMethod | string | null | undefined) =>
        pm && typeof pm !== "string" && pm.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null;

      const cust = await stripe.customers.retrieve(s.stripeCustomerId, { expand: ["invoice_settings.default_payment_method"] });
      tarjeta = carteDe((cust as Stripe.Customer).invoice_settings?.default_payment_method as Stripe.PaymentMethod | null);

      if (!tarjeta && s.stripeSubscriptionId) {
        const sp = await stripe.subscriptions.retrieve(s.stripeSubscriptionId, { expand: ["default_payment_method"] });
        tarjeta = carteDe(sp.default_payment_method as Stripe.PaymentMethod | null);
      }
      if (!tarjeta) {
        const pms = await stripe.paymentMethods.list({ customer: s.stripeCustomerId, type: "card", limit: 1 });
        tarjeta = carteDe(pms.data[0]);
      }
    } catch (e) {
      // carte non lisible (id Stripe d'un autre mode, customer supprimé…) → on n'affiche rien.
      console.warn("[equipo] tarjeta no legible para", s.stripeCustomerId, e instanceof Error ? e.message : e);
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
    currentPeriodEnd: s?.currentPeriodEnd ?? null,
    suscripcionStripe: Boolean(s?.stripeSubscriptionId),
    cancelAtPeriodEnd: Boolean(s?.cancelAtPeriodEnd),
    billingDisponible: Boolean(process.env.STRIPE_SECRET_KEY),
    tarjeta,
    miembros,
  };
}
