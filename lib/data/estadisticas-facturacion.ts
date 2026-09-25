import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchEntregasDeFacturas, totalEntregado } from "@/lib/entregas";
import { importesFactura } from "@/lib/facturas";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_A_SERVICIO, TIPO_LABEL } from "@/lib/tramites";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { calcularEstadisticas, type Estadisticas, type MovEmitida, type MovRecibida, type Periodo } from "@/lib/estadisticas-facturacion";

// Movimientos para las ESTADÍSTICAS DE FACTURACIÓN (bajo RLS, sede de la pastilla activa).
// Todas las filas, no las 600 de la lista: una cifra anual no puede quedarse corta. La API
// devuelve como mucho 1000 filas por petición, así que se lee por páginas.
// Cada fuente es tolerante: sin su tabla o sin sus columnas nuevas, se lee lo que haya.

type Pagina<T> = (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
const PAGINA = 1000;
const MAX_FILAS = 50000;

async function todas<T>(pagina: Pagina<T>): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let desde = 0; desde < MAX_FILAS; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return { data: out, error: null };
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const FALTA_COLUMNA = /column|schema cache|does not exist|relationship/i;

export type MovimientosFacturacion = {
  emitidas: MovEmitida[];
  recibidas: MovRecibida[];
  sinFecha: { emitidas: number; recibidas: number }; // no se pueden situar en el tiempo
};

export async function fetchMovimientosFacturacion(sedes?: string[] | null, incluirSinSede = false): Promise<MovimientosFacturacion> {
  const supabase = await createSupabaseServer();
  const dentro = sedes?.length ? `oficinaId.in.(${sedes.join(",")})` : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porSede = <Q,>(q: Q): Q => (dentro ? (q as any).or(incluirSinSede ? `${dentro},oficinaId.is.null` : dentro) : q);
  const enSede = (oficinaId: string | null | undefined) => !sedes?.length || (oficinaId ? sedes.includes(oficinaId) : incluirSinSede);
  const sinFecha = { emitidas: 0, recibidas: 0 };

  // Nombre del servicio de una factura de Aproba: el del catálogo del despacho (el mismo que
  // lleva el historial importado, así «Renovación de TIE» no sale partido en dos).
  const catalogo = new Map<string, string>();
  try {
    const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
    const ws = (mem as { workspaceId?: string } | null)?.workspaceId;
    if (ws) for (const sv of await fetchServiciosDeWorkspace(supabase, ws, null)) catalogo.set(sv.id, sv.label);
  } catch { /* sin catálogo: etiquetas genéricas */ }
  const servicioDe = (exp: { tipo?: string | null; servicioClave?: string | null } | null, concepto: string) => {
    if (exp) {
      const clave = exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo ?? ""] ?? "";
      return catalogo.get(clave) ?? TIPO_LABEL[exp.tipo ?? ""] ?? "";
    }
    // Sin expediente: una cita previa cobrada, o una factura manual (su concepto es el servicio).
    return /^cita previa/i.test(concepto) ? "Citas previas" : concepto.slice(0, 80);
  };

  // ── 1. Facturas de Aproba: emitidas, pagadas y vencidas (ni borradores ni anuladas).
  //      Una rectificativa entra con sus importes negativos y neutraliza a la original.
  type FilaFactura = { id: string; numero?: string | null; concepto?: string | null; expediente?: unknown; clienteNombre: string | null; baseImponible: unknown; iva: unknown; total: unknown; suplidos?: { importe: number }[] | null; estado: string; fechaEmision: string | null; oficinaId?: string | null };
  const leerFacturas = (cols: string, conSede: boolean) => todas<FilaFactura>((d, h) => {
    const q = supabase.from("Factura").select(cols).in("estado", ["EMITIDA", "PAGADA", "VENCIDA"]);
    return (conSede ? porSede(q) : q).order("id").range(d, h) as unknown as PromiseLike<{ data: FilaFactura[] | null; error: { message: string } | null }>;
  });
  let rf = await leerFacturas("id, numero, concepto, clienteNombre, baseImponible, iva, total, suplidos, estado, fechaEmision, oficinaId, expediente:Expediente(tipo, servicioClave)", true);
  if (rf.error && FALTA_COLUMNA.test(rf.error.message)) rf = await leerFacturas("id, numero, concepto, clienteNombre, baseImponible, iva, total, suplidos, estado, fechaEmision, oficinaId", true);
  if (rf.error && FALTA_COLUMNA.test(rf.error.message)) rf = await leerFacturas("id, numero, concepto, clienteNombre, baseImponible, iva, total, estado, fechaEmision", false);
  if (rf.error) throw new Error(`Estadísticas (facturas): ${rf.error.message}`);
  // Lo ya cobrado a cuenta de las que siguen vivas (pagos parciales).
  const vivas = rf.data.filter((f) => f.estado !== "PAGADA").map((f) => f.id);
  const entregas: Record<string, { importe: number }[]> = {};
  for (let i = 0; i < vivas.length; i += 200) Object.assign(entregas, await fetchEntregasDeFacturas(supabase, vivas.slice(i, i + 200)));
  const emitidas: MovEmitida[] = [];
  for (const f of rf.data) {
    if (!f.fechaEmision) { sinFecha.emitidas++; continue; }
    const imp = importesFactura({
      base: num(f.baseImponible) ?? 0, iva: num(f.iva) ?? undefined, total: num(f.total) ?? undefined,
      suplidos: Array.isArray(f.suplidos) ? f.suplidos.map((s) => ({ concepto: "", importe: Number(s.importe) || 0 })) : undefined,
    });
    const cobrado = f.estado === "PAGADA" ? imp.total : Math.min(imp.total, totalEntregado(entregas[f.id] ?? []));
    emitidas.push({
      fecha: f.fechaEmision.slice(0, 10), base: imp.base, iva: imp.iva, total: imp.total, cobrado, cliente: f.clienteNombre ?? "", fuente: "APROBA",
      ref: f.numero ?? "", concepto: f.concepto ?? "",
      servicio: servicioDe(uno(f.expediente as { tipo?: string | null; servicioClave?: string | null } | null), f.concepto ?? ""),
    });
  }

  // ── 2. Facturado ANTES de Aproba (historial importado con importe). Su sede es la del
  //      titular (cliente o empresa). Sin desglose guardado → solo cuenta en el total.
  type FilaHist = { fecha: string | null; importe: unknown; referencia?: string | null; etiqueta?: string | null; notas?: string | null; cobro?: string | null; baseImponible?: unknown; cuotaIva?: unknown; cliente?: unknown; empresa?: unknown };
  const leerHist = (cols: string) => todas<FilaHist>((d, h) =>
    supabase.from("ServicioHistorico").select(cols).not("importe", "is", null).order("id").range(d, h) as unknown as PromiseLike<{ data: FilaHist[] | null; error: { message: string } | null }>);
  const TITULAR = "cliente:Cliente(nombre, apellidos, oficinaId)";
  const H = "id, fecha, importe, referencia, etiqueta, notas";
  let rh = await leerHist(`${H}, cobro, baseImponible, cuotaIva, ${TITULAR}, empresa:Empresa(razonSocial, oficinaId)`);
  if (rh.error && FALTA_COLUMNA.test(rh.error.message)) rh = await leerHist(`${H}, cobro, ${TITULAR}, empresa:Empresa(razonSocial, oficinaId)`);
  if (rh.error && FALTA_COLUMNA.test(rh.error.message)) rh = await leerHist(`${H}, cobro, ${TITULAR}`);
  if (rh.error && FALTA_COLUMNA.test(rh.error.message)) rh = await leerHist(`${H}, ${TITULAR}`);
  for (const h of rh.error ? [] : rh.data) {
    const cli = uno(h.cliente as { nombre: string | null; apellidos: string | null; oficinaId?: string | null } | null);
    const emp = uno(h.empresa as { razonSocial: string | null; oficinaId?: string | null } | null);
    if (!enSede(emp ? emp.oficinaId : cli?.oficinaId)) continue;
    if (!h.fecha) { sinFecha.emitidas++; continue; }
    const total = num(h.importe) ?? 0;
    const base = num(h.baseImponible);
    emitidas.push({
      fecha: String(h.fecha).slice(0, 10),
      base, iva: base == null ? null : num(h.cuotaIva) ?? 0,
      total,
      cobrado: h.cobro === "COBRADA" ? total : h.cobro === "PENDIENTE" ? 0 : null,
      cliente: emp?.razonSocial ?? [cli?.nombre, cli?.apellidos].filter(Boolean).join(" "),
      fuente: "ANTERIOR",
      ref: h.referencia ?? "",
      // El concepto original (notas «Factura: …») dice más que la etiqueta genérica del servicio.
      concepto: (h.notas ?? "").replace(/^Factura:\s*/i, "") || (h.etiqueta ?? ""),
      servicio: h.etiqueta ?? "",
    });
  }

  // ── 3. Facturas recibidas (proveedores). `total` es lo que se paga: ya sin la retención.
  type FilaRec = { numero?: string | null; concepto?: string | null; proveedorNombre: string | null; fecha: string | null; baseImponible: unknown; cuotaIva: unknown; retencion?: unknown; total: unknown; estado?: string | null };
  const leerRec = (cols: string) => todas<FilaRec>((d, h) =>
    porSede(supabase.from("FacturaRecibida").select(cols)).order("id").range(d, h) as unknown as PromiseLike<{ data: FilaRec[] | null; error: { message: string } | null }>);
  const RB = "id, numero, concepto, proveedorNombre, fecha, baseImponible, cuotaIva, total, oficinaId";
  let rr = await leerRec(`${RB}, retencion, estado`);
  if (rr.error && FALTA_COLUMNA.test(rr.error.message)) rr = await leerRec(`${RB}, estado`);
  if (rr.error && FALTA_COLUMNA.test(rr.error.message)) rr = await leerRec(RB);
  const recibidas: MovRecibida[] = [];
  for (const r of rr.error ? [] : rr.data) {
    if (!r.fecha) { sinFecha.recibidas++; continue; }
    const base = num(r.baseImponible);
    const iva = base == null ? null : num(r.cuotaIva) ?? 0;
    const retencion = num(r.retencion) ?? 0;
    const total = num(r.total) ?? (base != null ? Math.round((base + (iva ?? 0) - retencion) * 100) / 100 : 0);
    recibidas.push({ fecha: String(r.fecha).slice(0, 10), base, iva, retencion, total, pagada: r.estado === "PAGADA", proveedor: r.proveedorNombre ?? "", ref: r.numero ?? "", concepto: r.concepto ?? "" });
  }

  return { emitidas, recibidas, sinFecha };
}

// Para las descargas (PDF y Excel): la misma sede que la pastilla activa en pantalla.
export async function cargarEstadisticas(periodo: Periodo): Promise<{ mov: MovimientosFacturacion; est: Estadisticas; sede: string | null }> {
  const filtro = await resolverOficina().catch(() => null);
  const mov = await fetchMovimientosFacturacion(filtro?.sedes ?? null, filtro?.incluirSinSede ?? false);
  const sede = filtro?.activa ? filtro.oficinas.find((o) => o.id === filtro.activa)?.nombre ?? null : null;
  return { mov, est: calcularEstadisticas(mov.emitidas, mov.recibidas, periodo, { hoy: new Date().toISOString().slice(0, 10) }), sede };
}
