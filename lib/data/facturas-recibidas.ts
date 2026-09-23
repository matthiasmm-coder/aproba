import { createSupabaseServer } from "@/lib/supabase/server";
import { mapFilaRecibida, COLS_RECIBIDA, COLS_RECIBIDA_PAGO, COLS_RECIBIDA_BASE, faltaMigracionRecibidas, faltaColumna } from "@/lib/facturas-recibidas-guardar";
import type { FacturaRecibida } from "@/lib/facturas-recibidas";

// Facturas recibidas del despacho (RLS). Sin migración → lista vacía (la sección se
// enseña igual; la primera subida devuelve el aviso de migración).
export const TOPE_RECIBIDAS = 1500;

export async function fetchFacturasRecibidas(sedes?: string[] | null, incluirSinSede = false, tope = TOPE_RECIBIDAS): Promise<FacturaRecibida[]> {
  const supabase = await createSupabaseServer();
  const consulta = (cols: string) => {
    let q = supabase.from("FacturaRecibida").select(cols).order("fecha", { ascending: false, nullsFirst: true }).order("createdAt", { ascending: false }).limit(tope);
    if (sedes?.length) {
      const dentro = `oficinaId.in.(${sedes.join(",")})`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).or(incluirSinSede ? `${dentro},oficinaId.is.null` : dentro);
    }
    return q;
  };
  const puedeReplegar = (msg: string) => faltaColumna(msg) && !/relation|does not exist/i.test(msg);
  let { data, error } = await consulta(COLS_RECIBIDA);
  // Sin la migración de retención → se pierde la línea de IRPF, nada más.
  if (error && puedeReplegar(error.message)) ({ data, error } = await consulta(COLS_RECIBIDA_PAGO));
  // Sin la de pago tampoco → columnas base (estado = pendiente, sin IBAN).
  if (error && puedeReplegar(error.message)) ({ data, error } = await consulta(COLS_RECIBIDA_BASE));
  if (error) {
    if (faltaMigracionRecibidas(error.message)) return [];
    throw new Error(`Facturas recibidas: ${error.message}`);
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapFilaRecibida);
}

export type ExpedienteVinculable = { id: string; referencia: string; cliente: string };

// Expedientes vivos para ligar un gasto a un expediente (suplido justificado). Opcional.
export async function fetchExpedientesParaVincular(): Promise<ExpedienteVinculable[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("Expediente").select("id, referencia, cliente:Cliente(nombre, apellidos)").is("archivadoAt", null).order("createdAt", { ascending: false }).limit(400);
  return ((data ?? []) as { id: string; referencia: string; cliente: { nombre?: string; apellidos?: string } | { nombre?: string; apellidos?: string }[] | null }[]).map((e) => {
    const c = Array.isArray(e.cliente) ? e.cliente[0] : e.cliente;
    return { id: e.id, referencia: e.referencia, cliente: `${c?.nombre ?? ""} ${c?.apellidos ?? ""}`.trim() };
  });
}
