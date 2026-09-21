import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { conceptoRectificativa, importesRectificativa, prefijoRectificativa } from "@/lib/facturas";
import { siguienteNumero } from "@/lib/factura-numero";
import { fmtFechaCorta } from "@/lib/tramites";
import { fiscalDeOficina, oficinaDeFacturaFila } from "@/lib/facturacion-oficina";
import { configParaFactura } from "@/lib/verifactu-envio";

// FACTURA RECTIFICATIVA (RD 1619/2012, art. 15) — petición de Luis, Asenjo Global, 21/09/2026.
//
// Una factura emitida no se borra: la numeración correlativa no admite huecos y, con
// VERI*FACTU, queda registrada en la AEAT. Lo que corrige una factura ya emitida es una
// rectificativa: documento propio, número en SERIE ESPECÍFICA (R-2026-0001), que
// identifica a la rectificada y lleva los importes en negativo (rectificación por
// diferencia). El producto mandaba al gestor a «emitir una rectificativa» en tres
// mensajes de error y no la tenía.
//
// La original NO se toca: conserva su número, su estado y su registro. Las dos se leen
// juntas (Factura.rectificaId) y suman cero.
export const dynamic = "force-dynamic";

const faltaMigracion = (msg: string) => /rectificaId|column|schema cache|does not exist/i.test(msg);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { motivo?: unknown };
  const motivo = String(body.motivo ?? "").trim().slice(0, 200);

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS (anti-IDOR): una factura de otro despacho «no existe».
  const COLS = "id, workspaceId, numero, estado, concepto, clienteNombre, baseImponible, iva, total, expedienteId, oficinaId, fechaVencimiento";
  let res = await supa.from("Factura").select(`${COLS}, lineas, suplidos, clienteDatos, clienteId, familiaId, empresaId, rectificaId`).eq("id", id).maybeSingle();
  let sinExtras = false;
  if (res.error) { sinExtras = true; res = await supa.from("Factura").select(COLS).eq("id", id).maybeSingle() as typeof res; }
  const f = res.data as (Record<string, unknown> & { id: string; workspaceId: string; numero: string; estado: string; total: number }) | null;
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  if (f.estado === "BORRADOR") {
    return NextResponse.json({ error: "Un borrador no se rectifica: edítalo o elimínalo." }, { status: 409 });
  }
  if (!sinExtras && f.rectificaId) {
    return NextResponse.json({ error: "Esta factura YA es una rectificativa: no se rectifica a sí misma." }, { status: 409 });
  }
  if (Number(f.total) < 0) {
    return NextResponse.json({ error: "Esta factura tiene importe negativo: ya es un abono." }, { status: 409 });
  }

  const admin = createSupabaseAdmin();
  // Una factura se rectifica UNA vez (el índice único lo garantiza; aquí se dice mejor).
  const yaQ = await admin.from("Factura").select("id, numero").eq("rectificaId", id).maybeSingle();
  if (yaQ.error && faltaMigracion(yaQ.error.message)) {
    return NextResponse.json({ error: "Falta la migración: ejecuta supabase/factura-rectificativa.sql." }, { status: 500 });
  }
  if (yaQ.data) {
    return NextResponse.json({ error: `Esta factura ya se rectificó con la ${(yaQ.data as { numero: string }).numero}.`, id: (yaQ.data as { id: string }).id }, { status: 409 });
  }

  // Serie propia, y con el prefijo de SU sede si la tiene (R-DG-2026-0001).
  let prefijoOficina = "";
  try {
    const sede = await oficinaDeFacturaFila(supa, { oficinaId: (f.oficinaId as string | null) ?? null, expedienteId: (f.expedienteId as string | null) ?? null });
    if (sede) prefijoOficina = ((await fiscalDeOficina(supa, sede))?.prefijoSerie ?? "").trim();
  } catch { /* sin fase 6 → serie común */ }
  const hoy = new Date();
  const numero = await siguienteNumero(admin, f.workspaceId, hoy.getFullYear(), prefijoRectificativa(prefijoOficina));

  const imp = importesRectificativa({
    baseImponible: Number(f.baseImponible), iva: Number(f.iva), total: Number(f.total),
    lineas: (f.lineas as { concepto: string; base: number }[] | null) ?? null,
    suplidos: (f.suplidos as { concepto: string; importe: number }[] | null) ?? null,
  });

  const nuevoId = crypto.randomUUID();
  const fila: Record<string, unknown> = {
    id: nuevoId, workspaceId: f.workspaceId, numero,
    clienteNombre: f.clienteNombre, concepto: conceptoRectificativa(f.numero, motivo),
    baseImponible: imp.baseImponible, iva: imp.iva, total: imp.total,
    // Una rectificativa nace EMITIDA y sin vencimiento: no es una deuda que perseguir,
    // es el abono de otra factura.
    estado: "EMITIDA", origen: "MANUAL", fechaEmision: hoy.toISOString(),
    rectificaId: f.id,
    ...(f.expedienteId ? { expedienteId: f.expedienteId } : {}),
    ...(f.oficinaId ? { oficinaId: f.oficinaId } : {}),
    ...(imp.lineas ? { lineas: imp.lineas } : {}),
    ...(imp.suplidos ? { suplidos: imp.suplidos } : {}),
    ...(f.clienteDatos ? { clienteDatos: f.clienteDatos } : {}),
    ...(f.clienteId ? { clienteId: f.clienteId } : {}),
    ...(f.familiaId ? { familiaId: f.familiaId } : {}),
    ...(f.empresaId ? { empresaId: f.empresaId } : {}),
  };
  const { error } = await admin.from("Factura").insert(fila);
  if (error) {
    if (/rectificaId/i.test(error.message)) return NextResponse.json({ error: "Falta la migración: ejecuta supabase/factura-rectificativa.sql." }, { status: 500 });
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "Esa factura ya se rectificó. Vuelve a cargar la página." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Traza en el historial del expediente: emitir una rectificativa es una decisión contable.
  if (f.expedienteId) {
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: String(f.expedienteId), tipo: "COMENTARIO", userId: user.id,
      descripcion: `🧾 Rectificativa ${numero} emitida sobre la factura ${f.numero}${motivo ? ` — ${motivo}` : ""}`,
    });
  }

  // VERI*FACTU: una rectificativa lleva importes negativos y su registro tiene un tipo
  // propio que Verifacti aún no acepta por esta vía (lib/verifactu.ts). NO se envía en
  // silencio: se avisa para que el gestor sepa que ese registro queda pendiente.
  let verifactuPendiente = false;
  try { verifactuPendiente = Boolean(await configParaFactura(admin, { workspaceId: f.workspaceId, oficinaId: (f.oficinaId as string | null) ?? null, expedienteId: (f.expedienteId as string | null) ?? null })); }
  catch { /* sin VERI*FACTU configurado */ }

  return NextResponse.json({ ok: true, id: nuevoId, numero, fecha: fmtFechaCorta(hoy.toISOString()) ?? "", total: imp.total, verifactuPendiente });
}
