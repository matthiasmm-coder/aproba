// ENTREGAS A CUENTA — pagos parciales de una factura (Gesadmbcn, 17/08/2026).
//
// El saldo NUNCA se guarda: se deduce de la suma de entregas. Una sola verdad,
// ningún descuadre posible entre un contador y sus movimientos.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Entrega = {
  id: string;
  facturaId: string;
  importe: number;
  fecha: string;          // AAAA-MM-DD
  metodo: string;         // efectivo | transferencia | tarjeta | otro
  nota?: string | null;
};

export const METODOS = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["tarjeta", "Tarjeta"],
  ["otro", "Otro"],
] as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;

// Método de la entrega (minúsculas) → metodoPago de Factura (mayúsculas). Hasta el
// 01/09/2026 el cierre por entregas grababa TRANSFERENCIA fijo: un cliente que saldaba
// en efectivo acababa con «Pagado por transferencia» en un documento contable.
export type MetodoPago = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO";
export const metodoFactura = (m: string | null | undefined): MetodoPago =>
  m === "efectivo" ? "EFECTIVO" : m === "tarjeta" ? "TARJETA" : m === "otro" ? "OTRO" : "TRANSFERENCIA";

/** Suma de entregas de una factura. */
export const totalEntregado = (entregas: { importe: number }[]): number =>
  r2(entregas.reduce((a, e) => a + Number(e.importe || 0), 0));

/** Lo que queda por cobrar. Nunca negativo: un exceso no es «deuda negativa». */
export const saldoPendiente = (total: number, entregas: { importe: number }[]): number =>
  Math.max(0, r2(Number(total || 0) - totalEntregado(entregas)));

/** ¿Las entregas cubren ya la factura? (tolerancia de 1 céntimo por redondeos) */
export const estaCubierta = (total: number, entregas: { importe: number }[]): boolean =>
  totalEntregado(entregas) + 0.005 >= r2(Number(total || 0));

/** Estados donde una entrega tiene sentido: hay deuda viva. */
export const admiteEntregas = (estado: string): boolean => estado === "EMITIDA" || estado === "VENCIDA";

/** Entregas de un conjunto de facturas → { facturaId: [entregas] }. Vacío si la
 *  migración no está aplicada (el producto sigue funcionando como antes). */
export async function fetchEntregasDeFacturas(
  client: SupabaseClient, facturaIds: string[],
): Promise<Record<string, Entrega[]>> {
  if (!facturaIds.length) return {};
  try {
    const { data, error } = await client
      .from("EntregaCuenta")
      .select("id, facturaId, importe, fecha, metodo, nota")
      .in("facturaId", facturaIds)
      .order("fecha", { ascending: true });
    if (error) return {};
    const out: Record<string, Entrega[]> = {};
    for (const e of (data ?? []) as Entrega[]) (out[e.facturaId] ??= []).push({ ...e, importe: Number(e.importe) });
    return out;
  } catch { return {}; }
}
