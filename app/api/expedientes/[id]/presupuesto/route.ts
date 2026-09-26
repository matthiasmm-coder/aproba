import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosConfig } from "@/lib/data/config";
import { honorariosCobrados, tieneCuotas } from "@/lib/facturas";
import { aplicarDescuento, asignacionValida, catalogoDeSede, clavesDeExpediente, descuentoValido, serviciosDeExpediente, suplidosAsignados, tarifaAsignada } from "@/lib/multi-servicio";
import { presupuestoOpcionesValidas, tarifasPropiasValidas, type TarifasPropias } from "@/lib/tarifas-propias";

// PRESUPUESTO A MEDIDA (pedido por Juan, 26/09/2026): al generar el presupuesto, el gestor
// fija los honorarios de ESTE expediente —por servicio, al inicio y al finalizar— sin tocar
// el precio del servicio en Ajustes, y opcionalmente la validez y unas observaciones.
//   body.tarifas  = { [clave]: { anticipo, resto } } → precio propio · null → precio del catálogo
//   body.opciones = { validezDias, nota }            → solo el presupuesto · null → 30 días, sin nota
// El precio propio manda después en la hoja de encargo, el enlace del cliente y las facturas
// (serviciosDeExpediente). Sesión + RLS (anti-IDOR), como la ruta del descuento.
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const FALTA_MIGRACION = "Falta la migración: ejecuta supabase/expediente-presupuesto.sql en Supabase.";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { tarifas?: unknown; opciones?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del gestor.
  const { data: own } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const resExp = await admin.from("Expediente")
    .select("tipo, servicioClave, serviciosExtra, suplidosOverride, familiaId, serviciosAsignacion, descuento, oficinaId, tarifasPropias")
    .eq("id", id).maybeSingle();
  if (resExp.error) {
    const falta = /tarifasPropias|presupuestoOpciones/i.test(resExp.error.message);
    return NextResponse.json({ error: falta ? FALTA_MIGRACION : resExp.error.message }, { status: falta ? 409 : 500 });
  }
  const exp = resExp.data as {
    tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null; suplidosOverride?: { concepto: string; importe: number }[] | null;
    familiaId: string | null; serviciosAsignacion?: unknown; descuento?: unknown; oficinaId?: string | null; tarifasPropias?: unknown;
  } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Precio propio: solo para los servicios de ESTE expediente (una clave ajena no pinta nada).
  let tarifas: TarifasPropias | null = null;
  if (body.tarifas !== null && body.tarifas !== undefined) {
    const claves = clavesDeExpediente(exp);
    const validas = tarifasPropiasValidas(body.tarifas);
    const suyas = validas ? Object.fromEntries(Object.entries(validas).filter(([c]) => claves.includes(c))) : {};
    if (Object.keys(suyas).length) tarifas = suyas;
    else if (body.tarifas && typeof body.tarifas === "object" && Object.keys(body.tarifas as object).length) {
      return NextResponse.json({ error: "Importe inválido: usa euros sin IVA, de 0 a 100.000." }, { status: 400 });
    }
  }
  const opciones = body.opciones === null || body.opciones === undefined ? null : presupuestoOpcionesValidas(body.opciones);

  // Contexto de tarifa, ANTES y DESPUÉS, con la misma regla que factura /api/pagos: tarifa del
  // catálogo de la sede → precio propio → ×miembros → descuento.
  let nMiembros = 1;
  if (exp.familiaId) {
    const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", exp.familiaId);
    nMiembros = Math.max(1, count ?? 1);
  }
  const { servicios } = await fetchServiciosConfig();
  const catalogo = catalogoDeSede(servicios, exp.oficinaId ?? null);
  const asignacion = asignacionValida(exp.serviciosAsignacion);
  const descuento = descuentoValido(exp.descuento);
  const tarifaCon = (tp: unknown) => {
    const svs = serviciosDeExpediente({ ...exp, tarifasPropias: tp }, catalogo);
    return { svs, tarifa: tarifaAsignada(svs, asignacion, nMiembros) };
  };
  const antes = tarifaCon(exp.tarifasPropias);
  const despues = tarifaCon(tarifas);
  const conDesc = aplicarDescuento(despues.tarifa, 1, descuento);

  // Guarda (misma que el descuento): unos honorarios en 0 € harían infacturables las
  // tasas/suplidos, que viajan en la primera factura automática.
  const conSuplidos = suplidosAsignados(exp.suplidosOverride, despues.svs, asignacion, nMiembros).length > 0;
  if (tarifas && conSuplidos && conDesc.anticipo + conDesc.resto <= 0) {
    return NextResponse.json({ error: "Con estos honorarios (0 €) las tasas y suplidos del expediente no se podrían facturar: van en la primera factura. Deja al menos 0,01 € de honorarios o quita los suplidos." }, { status: 400 });
  }

  const { error } = await admin.from("Expediente")
    .update({ tarifasPropias: tarifas, presupuestoOpciones: opciones, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    const falta = /tarifasPropias|presupuestoOpciones|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? FALTA_MIGRACION : error.message }, { status: falta ? 409 : 500 });
  }

  // Historial: solo si cambió el precio (la validez y la nota no mueven dinero).
  const totalAntes = r2(antes.tarifa.anticipo + antes.tarifa.resto);
  const totalDespues = r2(despues.tarifa.anticipo + despues.tarifa.resto);
  if (JSON.stringify(tarifasPropiasValidas(exp.tarifasPropias)) !== JSON.stringify(tarifas)) {
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id,
      descripcion: tarifas
        ? `Honorarios de este expediente: ${eur(totalDespues)} + IVA (antes ${eur(totalAntes)}). El precio del servicio en Ajustes no cambia.`
        : `Honorarios del expediente: vuelve el precio del servicio (${eur(totalDespues)} + IVA).`,
    });
  }

  // Dinero ya cobrado (misma regla que el descuento): una factura PAGADA no se reescribe. Si
  // el cliente ya pagó más que el nuevo total, es una devolución; con cuotas, ajuste a mano.
  try {
    const total = r2(conDesc.anticipo + conDesc.resto);
    const { data: fRows } = await admin.from("Factura").select("momento, estado, baseImponible").eq("expedienteId", id);
    const facturas = (fRows ?? []) as { momento: string | null; estado: string; baseImponible: number | string | null }[];
    const cobrado = honorariosCobrados(facturas);
    if (totalDespues !== totalAntes && cobrado - total > 0.005) {
      await admin.from("ExpedienteEvento").insert({
        id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
        descripcion: `⚠️ El cliente ya ha pagado ${cobrado.toFixed(2)} € de honorarios y el nuevo total es ${total.toFixed(2)} €: devuélvele ${r2(cobrado - total).toFixed(2)} € (+ IVA) o compénsalo en otro expediente.`,
      });
    } else if (totalDespues !== totalAntes && tieneCuotas(facturas)) {
      await admin.from("ExpedienteEvento").insert({
        id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
        descripcion: `⚠️ Este expediente se cobra en cuotas y el nuevo precio NO las modifica: quedan ${r2(total - cobrado).toFixed(2)} € de honorarios por cobrar. Ajusta las cuotas pendientes a mano desde Cobros.`,
      });
    }
  } catch { /* aviso best-effort */ }

  return NextResponse.json({ ok: true, total: r2(conDesc.anticipo + conDesc.resto) });
}
