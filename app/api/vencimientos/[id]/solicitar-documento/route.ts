import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { asegurarEspacioToken } from "@/lib/espacio";
import { enviarSolicitudDocumento } from "@/lib/notificaciones";
import { esVencimientoDeServicio } from "@/lib/renovacion-servicio";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";

// VIGÍA — «Pedir el documento nuevo» (11/09/2026): un vencimiento de DOCUMENTO (pasaporte,
// certificado de NIE…) no es un trámite del despacho: no hay servicio, ni expediente, ni
// factura. Se pide al cliente el documento renovado (email + su espacio /c) y el
// vencimiento queda SOLICITADO; cuando lo suba con una fecha posterior, sembrarVencimiento
// lo devuelve a PENDIENTE con la fecha nueva y anota recibidoAt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Resuelto BAJO SESIÓN (RLS): si no es de un workspace del usuario, no existe.
  const { data: venc, error: eV } = await supa.from("Vencimiento").select("id, workspaceId, clienteId, fecha, tipo, estado").eq("id", id).maybeSingle();
  if (eV) return NextResponse.json({ error: eV.message }, { status: 500 });
  if (!venc) return NextResponse.json({ error: "Vencimiento no encontrado." }, { status: 404 });
  if (esVencimientoDeServicio(String(venc.tipo))) {
    return NextResponse.json({ error: "Este vencimiento es un trámite del despacho: propón la renovación.", esServicio: true }, { status: 400 });
  }
  if (venc.estado === "HECHO") return NextResponse.json({ error: "Este vencimiento ya está cerrado." }, { status: 409 });

  const admin = createSupabaseAdmin();
  const espacioToken = await asegurarEspacioToken(admin, String(venc.clienteId));
  if (!espacioToken) return NextResponse.json({ error: "No se pudo crear el espacio del cliente (¿falta la migración cliente-espacio.sql?)." }, { status: 500 });

  const ahora = new Date().toISOString();
  let { error: eUp } = await admin.from("Vencimiento").update({ estado: "SOLICITADO", solicitadoAt: ahora, recibidoAt: null, updatedAt: ahora }).eq("id", venc.id);
  if (eUp && /solicitadoAt|recibidoAt|column|schema cache/i.test(eUp.message)) {
    return NextResponse.json({ error: "Falta la migración supabase/vigia-propuesta.sql (petición de documento renovado)." }, { status: 500 });
  }
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });

  const aviso = await enviarSolicitudDocumento(admin, {
    workspaceId: String(venc.workspaceId), clienteId: String(venc.clienteId), tipoVencimiento: String(venc.tipo),
    fechaCaducidad: venc.fecha as string, espacioToken, vencimientoId: venc.id as string, baseUrl: baseUrlFromRequest(req),
  });
  return NextResponse.json({ ok: true, avisoEnviado: aviso.enviado, motivoAviso: aviso.motivo ?? null });
}
