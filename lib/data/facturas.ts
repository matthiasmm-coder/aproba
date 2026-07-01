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
};

// lineas/suplidos/notas son columnas nuevas (Pro/Business). Se piden en el SELECT; si la
// migración aún no se aplicó, se reintenta sin ellas (repli propre).
const COLS_BASE: string = "id, numero, clienteNombre, concepto, baseImponible, estado, origen, momento, fechaEmision, fechaVencimiento";
const SELECT: string = `${COLS_BASE}, lineas, suplidos, notas`;

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
  };
}

export async function fetchFacturas(): Promise<Factura[]> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("Factura").select(SELECT).order("numero", { ascending: false });
  if (res.error) res = await supabase.from("Factura").select(COLS_BASE).order("numero", { ascending: false });
  if (res.error) throw new Error(`Facturas: ${res.error.message}`);
  return ((res.data ?? []) as unknown as Row[]).map(mapRow);
}

// Todas las facturas de un expediente (para el export ZIP). Completas (líneas/suplidos).
export async function fetchFacturasDeExpediente(expedienteId: string): Promise<Factura[]> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("Factura").select(SELECT).eq("expedienteId", expedienteId).order("numero", { ascending: true });
  if (res.error) res = await supabase.from("Factura").select(COLS_BASE).eq("expedienteId", expedienteId).order("numero", { ascending: true });
  if (res.error) throw new Error(`Facturas exp ${expedienteId}: ${res.error.message}`);
  return ((res.data ?? []) as unknown as Row[]).map(mapRow);
}

export async function fetchFactura(id: string): Promise<Factura | null> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("Factura").select(SELECT).eq("id", id).maybeSingle();
  if (res.error) res = await supabase.from("Factura").select(COLS_BASE).eq("id", id).maybeSingle();
  if (res.error) throw new Error(`Factura ${id}: ${res.error.message}`);
  return res.data ? mapRow(res.data as unknown as Row) : null;
}
