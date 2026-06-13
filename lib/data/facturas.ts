import { createSupabaseServer } from "@/lib/supabase/server";
import { fmtFechaCorta } from "@/lib/tramites";
import type { Factura, FacturaEstado } from "@/lib/facturas";

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
};

const SELECT = "id, numero, clienteNombre, concepto, baseImponible, estado, origen, momento, fechaEmision, fechaVencimiento";

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
  };
}

export async function fetchFacturas(): Promise<Factura[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("Factura")
    .select(SELECT)
    .order("numero", { ascending: false });
  if (error) throw new Error(`Facturas: ${error.message}`);
  return ((data ?? []) as Row[]).map(mapRow);
}

export async function fetchFactura(id: string): Promise<Factura | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("Factura").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`Factura ${id}: ${error.message}`);
  return data ? mapRow(data as Row) : null;
}
