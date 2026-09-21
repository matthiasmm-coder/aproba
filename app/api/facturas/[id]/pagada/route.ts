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
  // Método real del cobro (elegido por el gestor al confirmar). Sin body o valor
  // desconocido → TRANSFERENCIA, el comportamiento histórico.
  const body = (await req.json().catch(() => ({}))) as { metodo?: string };
  const metodo = (["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const).find((m) => m === body.metodo) ?? "TRANSFERENCIA";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: f } = await supabase.from("Factura").select("id, estado, expedienteId, numero, total").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  // Una rectificativa es un ABONO: no se cobra, se devuelve. Marcarla «pagada» enviaría
  // al cliente una confirmación de pago por un importe negativo (21/09/2026).
  if (Number(f.total) < 0) return NextResponse.json({ error: "Una factura rectificativa no se cobra: es un abono a favor del cliente." }, { status: 409 });
  if (f.estado === "PAGADA") return NextResponse.json({ ok: true, estado: "PAGADA" });
  if (f.estado === "ANULADA") return NextResponse.json({ error: "La factura está anulada: no puede marcarse como pagada." }, { status: 409 });

  const admin = createSupabaseAdmin();
  const r = await marcarFacturaPagada(admin, id, metodo);
  if (!r) return NextResponse.json({ error: "No se pudo confirmar el pago." }, { status: 500 });
  if (r === "nuevo" && f.expedienteId) {
    await enviarConfirmacionPago(admin, { expedienteId: String(f.expedienteId), numero: String(f.numero), total: Number(f.total), metodo, baseUrl: baseUrlFromRequest(req) });
  }
  return NextResponse.json({ ok: true, estado: "PAGADA" });
}

// DESHACER EL COBRO (petición de Luis, Asenjo Global, 21/09/2026): marcar «pagada» por
// error dejaba la factura en un callejón sin salida — ni editar, ni anular, ni eliminar,
// ni volver atrás. Equivocarse al registrar un cobro NO es un error contable: la factura
// se emitió bien, su número sigue siendo válido y lo único falso es el estado del pago.
// Vuelve a EMITIDA (o VENCIDA si ya pasó su fecha) y se borra el método de cobro.
//
// Lo que NO se deshace aquí: si hay entregas a cuenta, ha entrado dinero de verdad y el
// rastro no puede quedar colgando de una factura pendiente — se retiran antes. Y si el
// cobro se hizo con tarjeta en la plataforma, el dinero está en la cuenta de Stripe:
// deshacerlo aquí no lo devuelve (el diálogo lo avisa).
//
// VERI*FACTU no se toca: el registro en la AEAT es del ALTA de la factura, no de su
// cobro. Deshacer un cobro no cambia nada de lo declarado.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: una factura de otro despacho «no existe» (anti-IDOR).
  const { data: f } = await supabase.from("Factura").select("id, estado, numero, total, metodoPago, expedienteId, fechaVencimiento").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (f.estado !== "PAGADA") return NextResponse.json({ error: "Esta factura no está marcada como pagada." }, { status: 409 });

  const admin = createSupabaseAdmin();
  const entregas = await admin.from("EntregaCuenta").select("id", { count: "exact", head: true }).eq("facturaId", id);
  if (!entregas.error && (entregas.count ?? 0) > 0) {
    return NextResponse.json({ error: "Esta factura tiene entregas a cuenta registradas: retíralas antes de deshacer el cobro." }, { status: 409 });
  }

  // Vuelve a estar pendiente: VENCIDA si su fecha ya pasó, EMITIDA si no.
  const vence = f.fechaVencimiento ? new Date(String(f.fechaVencimiento)) : null;
  const estado = vence && !Number.isNaN(vence.getTime()) && vence.getTime() < Date.now() ? "VENCIDA" : "EMITIDA";
  // Update CONDICIONAL: si otro miembro la toca entre el select y el update, no la pisamos.
  const { data: upd, error } = await admin.from("Factura").update({ estado, metodoPago: null }).eq("id", id).eq("estado", "PAGADA").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!upd?.length) return NextResponse.json({ error: "La factura ha cambiado mientras tanto. Vuelve a cargar la página." }, { status: 409 });

  // Traza en el historial del expediente: deshacer un cobro es una decisión contable.
  if (f.expedienteId) {
    const via = f.metodoPago === "TARJETA" ? " (estaba como cobrada con tarjeta)" : f.metodoPago === "EFECTIVO" ? " (estaba como cobrada en efectivo)" : f.metodoPago === "TRANSFERENCIA" ? " (estaba como cobrada por transferencia)" : "";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: String(f.expedienteId), tipo: "COMENTARIO", userId: user.id,
      descripcion: `↩️ Cobro deshecho: la factura ${f.numero} vuelve a estar pendiente${via}`,
    });
  }
  return NextResponse.json({ ok: true, estado });
}
