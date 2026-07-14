import { createSupabaseServer } from "@/lib/supabase/server";
import { fmtFechaCorta } from "@/lib/tramites";
import type { Factura, FacturaEstado, LineaFactura, Suplido } from "@/lib/facturas";

// Couche d'accès aux facturas (Supabase + RLS).

type Row = {
  id: string;
  numero: string;
  clienteNombre: string;
  concepto: string;
  baseImponible: number | string;
  estado: string;
  origen: string | null;
  momento: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  lineas?: LineaFactura[] | null;
  suplidos?: Suplido[] | null;
  notas?: string | null;
  archivadoAt?: string | null;
};

// lineas/suplidos/notas (Pro/Business) y archivadoAt son columnas nuevas. Se piden en el
// SELECT; si la migración aún no se aplicó, se reintenta sin ellas, en cascada (repli propre):
// completo → sin archivadoAt → base. Cada grupo de columnas tiene su propia migración.
const COLS_BASE: string = "id, numero, clienteNombre, concepto, baseImponible, estado, origen, momento, fechaEmision, fechaVencimiento";
const SELECT_LIN: string = `${COLS_BASE}, lineas, suplidos, notas`;
const SELECT_FULL: string = `${SELECT_LIN}, archivadoAt`;

// Falta la columna → repli; cualquier OTRO error (timeout, red, RLS) se re-lanza en vez de
// caer a un SELECT más pobre (que perdería el flag archivado y mostraría archivadas como
// activas). Mismo criterio gateado que el resto del repo.
const FALTA_COLUMNA = /column|schema cache|does not exist/i;

// Tres niveles de repli: completo → sin archivadoAt (falta factura-archivado.sql) → base
// (falta también factura-lineas.sql).
async function selectFacturas<T>(
  run: (cols: string) => PromiseLike<{ data: T; error: { message: string } | null }>,
  contexto = "Facturas",
): Promise<T> {
  let res = await run(SELECT_FULL);
  if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await run(SELECT_LIN);
  if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await run(COLS_BASE);
  if (res.error) throw new Error(`${contexto}: ${res.error.message}`);
  return res.data;
}

function mapRow(f: Row): Factura {
  return {
    id: f.id,
    numero: f.numero,
    cliente: f.clienteNombre,
    concepto: f.concepto,
    base: Number(f.baseImponible),
    estado: f.estado as FacturaEstado,
    fecha: fmtFechaCorta(f.fechaEmision) ?? "—",
    vence: fmtFechaCorta(f.fechaVencimiento),
    origen: f.origen === "AUTOMATICA" ? "AUTOMATICA" : "MANUAL",
    momento: f.momento === "ANTICIPO" || f.momento === "FINAL" ? f.momento : null,
    lineas: Array.isArray(f.lineas) ? f.lineas : undefined,
    suplidos: Array.isArray(f.suplidos) ? f.suplidos : undefined,
    notas: f.notas ?? null,
    archivado: Boolean(f.archivadoAt),
  };
}

export async function fetchFacturas(): Promise<Factura[]> {
  const supabase = await createSupabaseServer();
  const data = await selectFacturas((cols) => supabase.from("Factura").select(cols).order("numero", { ascending: false }));
  return ((data ?? []) as unknown as Row[]).map(mapRow);
}

// Todas las facturas de un expediente (para el export ZIP). Completas (líneas/suplidos).
export async function fetchFacturasDeExpediente(expedienteId: string): Promise<Factura[]> {
  const supabase = await createSupabaseServer();
  const data = await selectFacturas((cols) => supabase.from("Factura").select(cols).eq("expedienteId", expedienteId).order("numero", { ascending: true }), `Facturas exp ${expedienteId}`);
  return ((data ?? []) as unknown as Row[]).map(mapRow);
}

export async function fetchFactura(id: string): Promise<Factura | null> {
  const supabase = await createSupabaseServer();
  const data = await selectFacturas((cols) => supabase.from("Factura").select(cols).eq("id", id).maybeSingle(), `Factura ${id}`);
  return data ? mapRow(data as unknown as Row) : null;
}

// ── Cobros pendientes (morosos) ──────────────────────────────────────────────
// Facturas EMITIDA/VENCIDA (ni borrador, ni pagada, ni anulada). Incluye
// expedienteId (para el recordatorio) y la fecha de vencimiento cruda (para
// calcular los días de retraso en el cliente). No se filtra por periodo: una
// deuda de hace meses sigue pendiente.
export type CobroPendiente = {
  id: string;
  numero: string;
  cliente: string;
  concepto: string;
  total: number;
  estado: "EMITIDA" | "VENCIDA";
  fecha: string | null; // emisión (corta)
  vence: string | null; // vencimiento (corta)
  venceISO: string | null; // para calcular días de retraso
  expedienteId: string | null; // para el recordatorio (null → factura manual sin expediente)
};

export async function fetchCobrosPendientes(): Promise<CobroPendiente[]> {
  const supabase = await createSupabaseServer();
  const cols = "id, numero, clienteNombre, concepto, total, estado, fechaEmision, fechaVencimiento, expedienteId";
  const base = () => supabase.from("Factura").select(cols).in("estado", ["EMITIDA", "VENCIDA"]);
  // Una factura archivada ya no se persigue: se excluye de los cobros. Repli SOLO si falta la
  // columna archivadoAt (factura-archivado.sql sin aplicar); un error transitorio se re-lanza
  // en vez de reaparecer las archivadas (que dispararían recordatorios no deseados).
  let res = await base().is("archivadoAt", null).order("fechaVencimiento", { ascending: true, nullsFirst: false });
  if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await base().order("fechaVencimiento", { ascending: true, nullsFirst: false });
  const { data, error } = res;
  if (error) throw new Error(`Cobros pendientes: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string; numero: string; clienteNombre: string; concepto: string; total: number | string;
    estado: string; fechaEmision: string | null; fechaVencimiento: string | null; expedienteId: string | null;
  }[]).map((f) => ({
    id: f.id,
    numero: f.numero,
    cliente: f.clienteNombre,
    concepto: f.concepto,
    total: Number(f.total),
    estado: f.estado === "VENCIDA" ? "VENCIDA" : "EMITIDA",
    fecha: fmtFechaCorta(f.fechaEmision) ?? null,
    vence: fmtFechaCorta(f.fechaVencimiento) ?? null,
    venceISO: f.fechaVencimiento,
    expedienteId: f.expedienteId,
  }));
}
