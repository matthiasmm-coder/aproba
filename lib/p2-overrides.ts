import type { SupabaseClient } from "@supabase/supabase-js";

// Lee la casilla de trámite p.2 forzada por el gestor (Expediente.p2Overrides, ej.
// {"EX-17":"DUPLICADO"}). Defensivo: sin la migración supabase/p2-overrides.sql (columna
// ausente) devuelve {} y todos los canales caen al automático (tipo del expediente).
export async function fetchP2Overrides(sb: SupabaseClient, expedienteId: string): Promise<Record<string, string>> {
  try {
    const { data, error } = await sb.from("Expediente").select("p2Overrides").eq("id", expedienteId).maybeSingle();
    if (error || !data?.p2Overrides || typeof data.p2Overrides !== "object") return {};
    return data.p2Overrides as Record<string, string>;
  } catch { return {}; }
}
