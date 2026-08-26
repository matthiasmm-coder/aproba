import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Active un essai TESTEUR : 15 jours, SANS carte (modoPrueba=true). Au bout des 15 j,
// la garde du layout /app bloque le compte et propose de s'abonner.
//
// ⚠️ 26/08/2026 — 30 → 15 jours. Mesuré sur tous les despachos depuis juin : AUCUN
// compte n'a jamais démarré après le 2ᵉ jour. Les jours 3-30 n'ont produit zéro
// activation. La durée doit rester alignée avec create_workspace (l'autre chemin
// d'alta, côté Postgres) — voir supabase/prueba-15-dias.sql.
// Subscription est verrouillée côté client (RLS) → on écrit en service_role après
// avoir vérifié que l'utilisateur appartient bien au workspace.
export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: mem } = await supabase
    .from("Membership")
    .select("workspaceId")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });

  const admin = createSupabaseAdmin();
  const trialEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("Subscription")
    .update({ modoPrueba: true, estado: "TRIAL", trialEndsAt: trialEnd })
    .eq("workspaceId", mem.workspaceId as string);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
