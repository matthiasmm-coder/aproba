import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// Enregistre des champs du despacho non modifiables côté client (table Workspace
// verrouillée en écriture par le RLS) : NIF, domicilio, email de facturación.
// Réservé à l'administrateur du workspace.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { nif?: string; domicilio?: string; emailFacturacion?: string };

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin
    .from("Membership")
    .select("workspaceId, role")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });
  if (!puedeGestionarEquipo(mem.role as string)) return NextResponse.json({ error: "Solo un administrador." }, { status: 403 });

  // On ne met à jour que les champs fournis (l'onboarding envoie tout, l'éditeur
  // Facturas n'envoie que domicilio/email).
  const patch: Record<string, string | null> = {};
  if ("nif" in body) patch.nif = String(body.nif ?? "").trim() || null;
  if ("domicilio" in body) patch.domicilio = String(body.domicilio ?? "").trim() || null;
  if ("emailFacturacion" in body) patch.emailFacturacion = String(body.emailFacturacion ?? "").trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from("Workspace").update(patch).eq("id", mem.workspaceId as string);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
