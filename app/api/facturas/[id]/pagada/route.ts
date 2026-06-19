import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Le gestor confirme avoir reçu le paiement (virement) → la facture passe à PAGADA.
// RLS : la lecture sous la session valide que la facture appartient au workspace de
// l'utilisateur ; l'écriture passe par le service_role (table Factura verrouillée).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: f } = await supabase.from("Factura").select("id, estado").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (f.estado === "PAGADA") return NextResponse.json({ ok: true, estado: "PAGADA" });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Factura").update({ estado: "PAGADA" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, estado: "PAGADA" });
}
