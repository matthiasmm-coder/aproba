import { createSupabaseServer } from "@/lib/supabase/server";
import { datosCanjeValidos, plazosCanje, situacionCanje } from "@/lib/canje";
import { normalizarEstado } from "@/lib/progreso";
import type { CanjeFuente } from "@/lib/alertas";

// La campana: los plazos de los canjes en curso (lib/canje.ts). Lectura BAJO SESIÓN: la RLS
// deja a cada gestor lo de sus sedes. Sin la columna (supabase/canje-permiso.sql), nada.
export async function fetchCanjesParaAlertas(hoy: Date = new Date()): Promise<CanjeFuente[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Expediente")
      .select("id, estado, fechaPresentacion, canje, cliente:Cliente(nombre, apellidos)")
      .not("canje", "is", null).is("archivadoAt", null).limit(500);
    if (error || !data?.length) return [];
    type Cli = { nombre: string | null; apellidos: string | null };
    return (data as unknown as { id: string; estado: string; fechaPresentacion: string | null; canje: unknown; cliente: Cli | Cli[] | null }[]).flatMap((e) => {
      const sit = situacionCanje(normalizarEstado(e.estado), e.fechaPresentacion);
      if (sit.terminado) return [];
      const c = Array.isArray(e.cliente) ? e.cliente[0] : e.cliente;
      const clienteNombre = `${c?.nombre ?? ""} ${c?.apellidos ?? ""}`.trim() || "Cliente";
      return plazosCanje(datosCanjeValidos(e.canje), { presentado: sit.presentado, hoy })
        .map((p) => ({ expedienteId: e.id, clienteNombre, tipo: p.tipo, dias: p.dias }));
    });
  } catch { return []; }
}
