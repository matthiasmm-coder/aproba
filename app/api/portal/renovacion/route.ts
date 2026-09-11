import { NextResponse, after } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { avisarRespuestaRenovacion } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// PORTAL — respuesta del cliente a la PROPUESTA de renovación (11/09/2026).
// Autorización = el portalToken del expediente de renovación (misma familia que /j).
//  · ACEPTADA → el vencimiento pasa a TRAMITANDO, se cobra el overage si procede y se
//    emite la factura de anticipo por la ruta de siempre (/api/pagos con token, idempotente
//    por expediente+momento, que además envía la solicitud de pago al cliente).
//  · RECHAZADA → el vencimiento queda RECHAZADA, el expediente se archiva (fuera del tablero)
//    y se desenlaza, para que el gestor pueda proponer de nuevo más adelante.
// En ambos casos el gestor lo ve en Vencimientos y recibe un email.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; respuesta?: string };
  const token = String(body.token ?? "").trim();
  const respuesta = body.respuesta === "ACEPTADA" ? "ACEPTADA" : body.respuesta === "RECHAZADA" ? "RECHAZADA" : null;
  if (!token || token.length < 8) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  if (!respuesta) return NextResponse.json({ error: "respuesta (ACEPTADA|RECHAZADA) requerida" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("id, workspaceId, clienteId, referencia, archivadoAt, cliente:Cliente(nombre, apellidos)").eq("portalToken", token).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const { data: venc, error: eV } = await admin.from("Vencimiento").select("id, estado, respuestaCliente").eq("expedienteRenovacionId", exp.id).maybeSingle();
  if (eV) return NextResponse.json({ error: eV.message }, { status: 500 });
  if (!venc) return NextResponse.json({ error: "Este expediente no tiene una propuesta de renovación." }, { status: 404 });
  if (venc.estado !== "PROPUESTA") {
    return NextResponse.json({ ok: true, yaRespondida: true, respuesta: venc.respuestaCliente ?? null, estado: venc.estado });
  }

  const ahora = new Date().toISOString();
  const c = (Array.isArray(exp.cliente) ? exp.cliente[0] : exp.cliente) as { nombre?: string | null; apellidos?: string | null } | null;
  const clienteNombre = `${c?.nombre ?? "El cliente"} ${c?.apellidos ?? ""}`.trim();
  const baseUrl = baseUrlFromRequest(req);
  const workspaceId = String(exp.workspaceId);

  if (respuesta === "ACEPTADA") {
    // Claim atómico: solo la primera respuesta cuenta (doble clic, dos pestañas).
    const { data: ok } = await admin.from("Vencimiento").update({ estado: "TRAMITANDO", respuestaCliente: "ACEPTADA", respondidoAt: ahora, updatedAt: ahora }).eq("id", venc.id).eq("estado", "PROPUESTA").select("id");
    if (!ok?.length) return NextResponse.json({ ok: true, yaRespondida: true });
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: "✅ El cliente ha aceptado la renovación" });
    // La renovación es ya un expediente de verdad: cuenta para la cuota mensual.
    await cobrarOverageSiProcede(admin, { workspaceId, expedienteId: exp.id as string, referencia: String(exp.referencia) });
    after(async () => {
      // Factura de anticipo por la ruta auditada (idempotente por expediente+momento; envía la
      // solicitud de pago). Sin tarifa → 400 «no tiene pago configurado»: no pasa nada.
      try {
        const r = await fetch(`${baseUrl}/api/pagos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, momento: "ANTICIPO" }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); if (!/no tiene pago configurado/i.test(String(d.error ?? ""))) console.error("[renovacion aceptada] anticipo:", d.error ?? r.status); }
      } catch (e) { console.error("[renovacion aceptada] anticipo:", e instanceof Error ? e.message : e); }
      await avisarRespuestaRenovacion(admin, { workspaceId, expedienteId: exp.id as string, referencia: String(exp.referencia), clienteNombre, respuesta: "ACEPTADA", baseUrl });
    });
    return NextResponse.json({ ok: true, respuesta: "ACEPTADA" });
  }

  const { data: ok } = await admin.from("Vencimiento").update({ estado: "RECHAZADA", respuestaCliente: "RECHAZADA", respondidoAt: ahora, expedienteRenovacionId: null, updatedAt: ahora }).eq("id", venc.id).eq("estado", "PROPUESTA").select("id");
  if (!ok?.length) return NextResponse.json({ ok: true, yaRespondida: true });
  await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: "❌ El cliente ha rechazado la renovación · expediente archivado" });
  if (!exp.archivadoAt) await admin.from("Expediente").update({ archivadoAt: ahora, updatedAt: ahora }).eq("id", exp.id);
  after(async () => { await avisarRespuestaRenovacion(admin, { workspaceId, expedienteId: exp.id as string, referencia: String(exp.referencia), clienteNombre, respuesta: "RECHAZADA", baseUrl }); });
  return NextResponse.json({ ok: true, respuesta: "RECHAZADA" });
}
