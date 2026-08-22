import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo, generarMandato } from "@/lib/encargo";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { serviciosDeExpediente, aplicarDescuento, asignacionValida, descuentoValido, suplidosAsignados, tarifaAsignada } from "@/lib/multi-servicio";
import { totalDe, r2 } from "@/lib/facturas";
import { TIPO_LABEL } from "@/lib/tramites";
import { enviarEncargoManual } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// ALTA EN MODO MANUAL — el correo del encargo (22/08, pedido de Matthias). El gestor
// eligió los servicios en el alta y validó lo que va a salir; aquí se compone y envía
// UN solo email al cliente: servicios contratados + factura inicial si la hay (el
// llamante la emitió antes vía /api/pagos con sinEmail) + hoja de encargo y mandato
// ADJUNTOS para firmar (solo si la función está activada en Ajustes; el mandato propio
// del despacho, si existe, viaja tal cual — misma regla que las descargas).
//
// Autorización: sesión + RLS (el expediente solo resuelve dentro de su workspace); el
// admin entra después únicamente para componer (PDF, factura, email). NO idempotente:
// reenviar es un gesto legítimo del gestor (como «Recordar»), y cada envío deja evento.

const SELECT = "id, referencia, tipo, servicioClave, serviciosExtra, suplidosOverride, descuento, serviciosAsignacion, familiaId, workspaceId, oficinaId, clienteId, cliente:Cliente(*)";
const REPLIS = [", serviciosAsignacion", ", descuento", ", suplidosOverride", ", serviciosExtra", ", clienteId"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { email?: unknown; facturaId?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Cadena de replis columna a columna (patrón de la descarga del encargo).
  let sel = SELECT;
  let res = await supabase.from("Expediente").select(sel).eq("id", id).maybeSingle();
  for (const col of REPLIS) {
    if (!res.error) break;
    sel = sel.replace(col, "");
    res = await supabase.from("Expediente").select(sel).eq("id", id).maybeSingle() as typeof res;
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  const exp = res.data as unknown as {
    id: string; referencia: string; tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null;
    suplidosOverride?: { concepto: string; importe: number }[] | null; descuento?: unknown; serviciosAsignacion?: unknown;
    familiaId?: string | null; workspaceId: string; oficinaId?: string | null; clienteId?: string | null;
    cliente: Record<string, string | null> | null;
  } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();

  // Destino: el email tecleado en el alta gana y se GUARDA en la ficha del cliente
  // (es un dato del cliente, no de este envío — la próxima vez ya estará).
  const emailIn = typeof body.email === "string" ? body.email.trim() : "";
  if (emailIn && !/^\S+@\S+\.\S+$/.test(emailIn)) {
    return NextResponse.json({ error: "El email no parece válido." }, { status: 400 });
  }
  const emailFicha = (exp.cliente?.email ?? "").trim();
  const destino = emailIn || emailFicha;
  if (!destino) return NextResponse.json({ error: "El cliente no tiene email. Añádelo para poder enviarle el encargo." }, { status: 400 });
  if (emailIn && emailIn !== emailFicha && exp.clienteId) {
    await admin.from("Cliente").update({ email: emailIn }).eq("id", exp.clienteId);
  }

  // Servicios contratados — mismo catálogo cascadado que las facturas y la ficha.
  const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null);
  const serviciosExp = serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipo }, catalogo);
  const serviciosLabels = serviciosExp.length
    ? serviciosExp.map((s) => s.label)
    : [TIPO_LABEL[exp.tipo] ?? exp.tipo];

  // PRECIO TOTAL del trámite (IVA incluido) — se calcula AQUÍ, no se acepta del cliente:
  // honorarios de todos los servicios (ya ×miembros y con el descuento del expediente)
  // más las tasas/suplidos, que van sin IVA. Sirve para que el correo distinga el pago
  // inicial del precio entero. 0 = sin tarifa configurada → el correo no lo menciona.
  let nMiembros = 1;
  if (exp.familiaId) {
    const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", exp.familiaId);
    nMiembros = Math.max(1, count ?? 1);
  }
  const asignacion = asignacionValida((exp as { serviciosAsignacion?: unknown }).serviciosAsignacion);
  const tarifa = tarifaAsignada(serviciosExp, asignacion, nMiembros);
  const conDescuento = aplicarDescuento(tarifa, 1, descuentoValido((exp as { descuento?: unknown }).descuento));
  const suplidosTotal = suplidosAsignados(exp.suplidosOverride, serviciosExp, asignacion, nMiembros)
    .reduce((a, x) => a + x.importe, 0);
  const totalTramite = r2(totalDe(conDescuento.anticipo) + totalDe(conDescuento.resto) + suplidosTotal);

  // Factura inicial (emitida justo antes por /api/pagos con sinEmail): se verifica que
  // pertenece a ESTE expediente — un facturaId ajeno no puede colarse en el correo.
  let factura: { facturaId: string; numero: string; total: number } | null = null;
  const facturaId = typeof body.facturaId === "string" ? body.facturaId.trim() : "";
  if (facturaId) {
    const { data: f } = await admin.from("Factura").select("id, numero, total").eq("id", facturaId).eq("expedienteId", exp.id).maybeSingle();
    if (!f) return NextResponse.json({ error: "Factura no encontrada en este expediente." }, { status: 404 });
    factura = { facturaId: f.id as string, numero: f.numero as string, total: Number(f.total) };
  }

  // Hoja de encargo + mandato adjuntos — solo si la gestoría activó la función en
  // Ajustes (misma puerta que el portal del cliente). El fallo de generación degrada a
  // «sin adjuntos» avisando: el alta no puede quedarse bloqueada por un PDF.
  let adjuntos: { filename: string; content: string }[] = [];
  let motivoSinAdjuntos: string | null = null;
  try {
    const { data: ws } = await admin.from("Workspace").select("hojaEncargoActiva, mandatoPropioPath").eq("id", exp.workspaceId).maybeSingle();
    const w = ws as { hojaEncargoActiva?: boolean; mandatoPropioPath?: string | null } | null;
    if (!w?.hojaEncargoActiva) {
      motivoSinAdjuntos = "hoja_desactivada";
    } else {
      const datos = await datosEncargo(admin, exp);
      if (!datos) {
        motivoSinAdjuntos = "sin_servicio";
      } else {
        const hoja = await generarHojaEncargo(datos);
        let mandato: Uint8Array | null = null;
        if (w.mandatoPropioPath) {
          const { data: blob } = await admin.storage.from("documentos").download(w.mandatoPropioPath);
          if (blob) mandato = new Uint8Array(await blob.arrayBuffer());
        }
        if (!mandato) mandato = await generarMandato(datos);
        adjuntos = [
          { filename: `hoja-de-encargo-${exp.referencia}.pdf`, content: Buffer.from(hoja).toString("base64") },
          { filename: `mandato-${exp.referencia}.pdf`, content: Buffer.from(mandato).toString("base64") },
        ];
      }
    }
  } catch (e) {
    console.error("[encargo-manual adjuntos]", e instanceof Error ? e.message : e);
    motivoSinAdjuntos = "error_pdf";
  }

  const estado = await enviarEncargoManual(admin, {
    expedienteId: exp.id,
    destino,
    serviciosLabels,
    factura,
    adjuntos: adjuntos.length ? adjuntos : undefined,
    baseUrl: baseUrlFromRequest(req),
    totalTramite,
  });
  if (estado === "ERROR") {
    return NextResponse.json({ error: "No se pudo enviar el email al cliente. Vuelve a intentarlo." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    enviado: estado, // ENVIADO | SIMULADO (entorno sin transporte real)
    email: destino,
    adjuntos: adjuntos.length > 0,
    motivoSinAdjuntos,
    factura: factura ? { numero: factura.numero, total: factura.total } : null,
  });
}
