import { createSupabaseServer } from "@/lib/supabase/server";
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
  billingDisponible: boolean; // STRIPE_SECRET_KEY présente côté serveur
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
    trialEndsAt?: string | null; currentPeriodEnd?: string | null; stripeSubscriptionId?: string | null;
  } | null;
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
    billingDisponible: Boolean(process.env.STRIPE_SECRET_KEY),
    miembros,
  };
}
