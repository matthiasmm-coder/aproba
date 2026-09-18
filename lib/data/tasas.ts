import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ES_TASA } from "@/lib/tasas";

// Tasas que este expediente YA generó alguna vez: los ficheros del storage
// (tasa-790-0XX[-cliente].pdf) y la 790-012 clásica, que vive en tasaPath.
//
// Sirve para que el cambio del 18/09/2026 —enseñar solo las tasas del servicio en vez de
// las cinco— no haga desaparecer un botón que el gestor venía usando: 23 de los 67
// expedientes con tasa generada llevan una que su servicio no predice (servicios propios
// del despacho, «srv_…», o un arraigo con la 012). Lo generado manda sobre la deducción.
// Solo se consulta mientras el gestor no haya curado la lista a mano.
export async function fetchTasasGeneradas(expedienteId: string, tasaPath?: string | null): Promise<string[]> {
  const out = new Set<string>();
  if (tasaPath) out.add("790-012"); // la columna histórica solo guarda la de Policía
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin.storage.from("documentos").list(expedienteId, { search: "tasa-790-" });
    for (const a of data ?? []) {
      const m = /^tasa-790-(\d{3})/.exec(a.name);
      const code = m ? `790-${m[1]}` : "";
      if (code && ES_TASA(code)) out.add(code);
    }
  } catch { /* storage caído: mejor la lista deducida que un 500 */ }
  return [...out];
}
