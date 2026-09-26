import type { SupabaseClient } from "@supabase/supabase-js";
import { presupuestoOpcionesValidas, tarifasPropiasValidas, type PresupuestoOpciones, type TarifasPropias } from "@/lib/tarifas-propias";

// Honorarios propios + opciones del presupuesto de un expediente (supabase/expediente-presupuesto.sql).
// Se leen APARTE de los SELECT largos de cada superficie —cada uno tiene su propia cadena de
// replis por migración— para no alargarlas: sin la migración (o sin permiso), todo vuelve
// null y el precio es el del catálogo, exactamente como antes.
export async function leerPresupuestoExp(
  client: SupabaseClient,
  expedienteId: string,
): Promise<{ tarifasPropias: TarifasPropias | null; opciones: PresupuestoOpciones | null }> {
  try {
    const { data, error } = await client.from("Expediente").select("tarifasPropias, presupuestoOpciones").eq("id", expedienteId).maybeSingle();
    if (error || !data) return { tarifasPropias: null, opciones: null };
    const d = data as { tarifasPropias?: unknown; presupuestoOpciones?: unknown };
    return { tarifasPropias: tarifasPropiasValidas(d.tarifasPropias), opciones: presupuestoOpcionesValidas(d.presupuestoOpciones) };
  } catch {
    return { tarifasPropias: null, opciones: null };
  }
}

// Varios expedientes de una vez (familia): id → tarifas propias.
export async function leerTarifasPropiasDe(client: SupabaseClient, ids: string[]): Promise<Map<string, TarifasPropias>> {
  const out = new Map<string, TarifasPropias>();
  if (!ids.length) return out;
  try {
    const { data, error } = await client.from("Expediente").select("id, tarifasPropias").in("id", ids);
    if (error) return out;
    for (const r of (data ?? []) as { id: string; tarifasPropias?: unknown }[]) {
      const t = tarifasPropiasValidas(r.tarifasPropias);
      if (t) out.set(r.id, t);
    }
  } catch { /* sin migración → mapa vacío */ }
  return out;
}
