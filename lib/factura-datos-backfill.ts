import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosFiscalesDeCliente, type ClienteDatosFactura } from "@/lib/facturas";

// Facturas emitidas ANTES del snapshot fiscal (factura-cliente-datos.sql): al mostrarlas
// se completa clienteDatos desde el cliente del EXPEDIENTE y se PERSISTE — a partir de
// ahí el dato queda congelado exactamente como en las facturas nuevas (nunca un join en
// vivo permanente: una edición posterior de la ficha no debe reescribir una factura).
// Facturas manuales sin expediente: sin fuente fiable → se quedan como están.
export async function completarClienteDatosFacturas(ids: string[]): Promise<Map<string, ClienteDatosFactura>> {
  const out = new Map<string, ClienteDatosFactura>();
  if (!ids.length) return out;
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.from("Factura").select("id, expedienteId, clienteDatos").in("id", ids);
  if (error) return out; // columna clienteDatos ausente (pre-migración) u otro fallo → sin backfill
  const filas = (data ?? []) as { id: string; expedienteId: string | null; clienteDatos: unknown }[];
  const sin = filas.filter((f) => !f.clienteDatos && f.expedienteId);
  if (!sin.length) return out;

  const expIds = [...new Set(sin.map((f) => f.expedienteId!))];
  const { data: exps } = await admin.from("Expediente").select("id, cliente:Cliente(*)").in("id", expIds);
  const datosDe = new Map<string, ClienteDatosFactura>();
  for (const e of (exps ?? []) as unknown as { id: string; cliente: Record<string, string | null> | Record<string, string | null>[] | null }[]) {
    const cli = Array.isArray(e.cliente) ? e.cliente[0] ?? null : e.cliente;
    const d = datosFiscalesDeCliente(cli);
    if (d) datosDe.set(e.id, d);
  }

  for (const f of sin) {
    const d = datosDe.get(f.expedienteId!);
    if (!d) continue;
    const { error: eUp } = await admin.from("Factura").update({ clienteDatos: d }).eq("id", f.id);
    if (eUp) { console.error("[factura backfill]", f.id, eUp.message); continue; }
    out.set(f.id, d);
  }
  return out;
}
