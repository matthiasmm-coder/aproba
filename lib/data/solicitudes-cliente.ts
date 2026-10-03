import { createSupabaseServer } from "@/lib/supabase/server";
import { DIAS_SOLICITUD, MARCA_SOLICITUD_CLIENTE, serviciosDeDescripcion } from "@/lib/solicitudes-cliente";
import type { SolFuente } from "@/lib/alertas";

// La campana: trámites que un cliente pidió desde su espacio en los últimos días y que nadie
// del despacho ha cogido todavía (sin responsable, sin archivar). Lectura BAJO SESIÓN: la RLS
// deja a cada gestor lo de sus sedes (un ASISTENTE no ve lo que no tiene asignado).
export async function fetchSolicitudesParaAlertas(): Promise<SolFuente[]> {
  try {
    const supabase = await createSupabaseServer();
    const desde = new Date(Date.now() - DIAS_SOLICITUD * 86_400_000).toISOString();
    const { data: evs, error } = await supabase.from("ExpedienteEvento").select("expedienteId, descripcion, createdAt")
      .eq("tipo", "CREADO").ilike("descripcion", `%${MARCA_SOLICITUD_CLIENTE}%`).gte("createdAt", desde)
      .order("createdAt", { ascending: false }).limit(100);
    if (error || !evs?.length) return [];
    const filas = evs as { expedienteId: string; descripcion: string; createdAt: string }[];
    const { data: exps } = await supabase.from("Expediente").select("id, cliente:Cliente(nombre, apellidos)")
      .in("id", [...new Set(filas.map((e) => e.expedienteId))]).is("asignadoAId", null).is("archivadoAt", null);
    type Cli = { nombre: string | null; apellidos: string | null };
    const porId = new Map(((exps ?? []) as { id: string; cliente: Cli | Cli[] | null }[]).map((x) => [x.id, x]));
    const vistos = new Set<string>();
    return filas.flatMap((ev) => {
      const x = porId.get(ev.expedienteId);
      if (!x || vistos.has(ev.expedienteId)) return [];
      vistos.add(ev.expedienteId);
      const c = Array.isArray(x.cliente) ? x.cliente[0] : x.cliente;
      const clienteNombre = `${c?.nombre ?? ""} ${c?.apellidos ?? ""}`.trim() || "Cliente";
      return [{ expedienteId: ev.expedienteId, clienteNombre, servicios: serviciosDeDescripcion(ev.descripcion), creadoAt: ev.createdAt }];
    });
  } catch { return []; }
}
