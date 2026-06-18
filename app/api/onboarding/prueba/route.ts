import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Active un essai TESTEUR : 30 jours, SANS carte (modoPrueba=true). Au bout des 30 j,
// la garde du layout /app bloque le compte et propose de s'abonner.
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
  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("Subscription")
    .update({ modoPrueba: true, estado: "TRIAL", trialEndsAt: trialEnd })
    .eq("workspaceId", mem.workspaceId as string);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
