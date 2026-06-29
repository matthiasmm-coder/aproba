import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { marcarFacturaPagada } from "@/lib/cobros-tarjeta";
import { enviarConfirmacionPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// Le gestor confirme avoir reçu le paiement (virement) → la facture passe à PAGADA.
// RLS : la lecture sous la session valide que la facture appartient au workspace de
// l'utilisateur ; l'écriture passe par le service_role (table Factura verrouillée).
// À la transition réelle, on envoie au client une confirmation de pago (sans IBAN).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: f } = await supabase.from("Factura").select("id, estado, expedienteId, numero, total").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (f.estado === "PAGADA") return NextResponse.json({ ok: true, estado: "PAGADA" });

  const admin = createSupabaseAdmin();
  const r = await marcarFacturaPagada(admin, id, "TRANSFERENCIA");
  if (!r) return NextResponse.json({ error: "No se pudo confirmar el pago." }, { status: 500 });
  if (r === "nuevo" && f.expedienteId) {
    await enviarConfirmacionPago(admin, { expedienteId: String(f.expedienteId), numero: String(f.numero), total: Number(f.total), metodo: "TRANSFERENCIA", baseUrl: baseUrlFromRequest(req) });
  }
  return NextResponse.json({ ok: true, estado: "PAGADA" });
}
