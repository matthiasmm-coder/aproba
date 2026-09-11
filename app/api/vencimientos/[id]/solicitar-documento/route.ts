import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { asegurarEspacioToken } from "@/lib/espacio";
import { enviarSolicitudDocumento } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";

// VIGÍA — «Pedir solo el documento nuevo» (camino SECUNDARIO del diálogo de renovación,
// 11/09/2026): el despacho NO va a tramitar la renovación (p. ej. el cliente renueva su
// pasaporte por su cuenta) y solo quiere el documento nuevo cuando lo tenga. Sin
// servicio, sin expediente, sin factura: email + su espacio /c; el vencimiento queda
// SOLICITADO y, cuando suba el documento con fecha posterior, vuelve a PENDIENTE con la
// fecha nueva (recibidoAt).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Resuelto BAJO SESIÓN (RLS): si no es de un workspace del usuario, no existe.
  const { data: venc, error: eV } = await supa.from("Vencimiento").select("id, workspaceId, clienteId, fecha, tipo, estado").eq("id", id).maybeSingle();
  if (eV) return NextResponse.json({ error: eV.message }, { status: 500 });
  if (!venc) return NextResponse.json({ error: "Vencimiento no encontrado." }, { status: 404 });
  if (venc.estado === "HECHO") return NextResponse.json({ error: "Este vencimiento ya está cerrado." }, { status: 409 });

  const admin = createSupabaseAdmin();
  // Sin email no hay petición: NADA se escribe (antes la fila quedaba «Documento pedido»
  // sin que nadie hubiera recibido nada — visto por Matthias en su ws de test, 11/09).
  const { data: cli } = await admin.from("Cliente").select("email").eq("id", String(venc.clienteId)).maybeSingle();
  if (!(cli as { email?: string | null } | null)?.email?.trim()) {
    return NextResponse.json({ error: "El cliente no tiene email: añádelo en su ficha y vuelve a intentarlo. No se ha pedido nada.", sinEmail: true }, { status: 400 });
  }
  const espacioToken = await asegurarEspacioToken(admin, String(venc.clienteId));
  if (!espacioToken) return NextResponse.json({ error: "No se pudo crear el espacio del cliente (¿falta la migración cliente-espacio.sql?)." }, { status: 500 });

  // El email sale ANTES de marcar nada: si no se puede enviar, el vencimiento no cambia.
  const aviso = await enviarSolicitudDocumento(admin, {
    workspaceId: String(venc.workspaceId), clienteId: String(venc.clienteId), tipoVencimiento: String(venc.tipo),
    fechaCaducidad: venc.fecha as string, espacioToken, vencimientoId: venc.id as string, baseUrl: baseUrlFromRequest(req),
  });
  if (!aviso.enviado && aviso.motivo !== "simulado") {
    return NextResponse.json({ error: aviso.motivo === "sin_email" ? "El cliente no tiene email: añádelo en su ficha y vuelve a intentarlo. No se ha pedido nada." : "No se pudo enviar el email al cliente. No se ha pedido nada: inténtalo de nuevo.", sinEmail: aviso.motivo === "sin_email" }, { status: aviso.motivo === "sin_email" ? 400 : 502 });
  }

  const ahora = new Date().toISOString();
  const { error: eUp } = await admin.from("Vencimiento").update({ estado: "SOLICITADO", solicitadoAt: ahora, recibidoAt: null, updatedAt: ahora }).eq("id", venc.id);
  if (eUp && /solicitadoAt|recibidoAt|column|schema cache/i.test(eUp.message)) {
    return NextResponse.json({ error: "Falta la migración supabase/vigia-propuesta.sql (petición de documento renovado)." }, { status: 500 });
  }
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });
  return NextResponse.json({ ok: true, avisoEnviado: aviso.enviado, motivoAviso: aviso.motivo ?? null });
}
