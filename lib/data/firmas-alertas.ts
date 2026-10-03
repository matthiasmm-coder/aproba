import { createSupabaseServer } from "@/lib/supabase/server";
import type { FirmaFuente } from "@/lib/alertas";

// La campana: envíos de firma en línea aún sin firmar (lib/firma). Lectura BAJO SESIÓN: la RLS
// deja a cada gestor lo de su despacho. Sin la tabla (migración pendiente), nada.
export async function fetchFirmasParaAlertas(): Promise<FirmaFuente[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("FirmaSobre")
      .select("id, expedienteId, firmanteNombre, documentos, enviadoAt, abiertoAt, expiraAt")
      .eq("estado", "PENDIENTE").not("enviadoAt", "is", null).limit(200);
    if (error || !data) return [];
    const ahora = Date.now();
    return (data as { id: string; expedienteId: string; firmanteNombre: string | null; documentos: { titulo: string }[]; enviadoAt: string; abiertoAt: string | null; expiraAt: string | null }[])
      .filter((s) => !s.expiraAt || Date.parse(s.expiraAt) > ahora)
      .map((s) => ({
        sobreId: s.id, expedienteId: s.expedienteId, clienteNombre: s.firmanteNombre || "Cliente",
        documentos: (s.documentos ?? []).map((d) => d.titulo).join(" · "), enviadoAt: s.enviadoAt, abierto: Boolean(s.abiertoAt),
      }));
  } catch { return []; }
}
