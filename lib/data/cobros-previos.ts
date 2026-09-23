import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL, fmtFechaCorta } from "@/lib/tramites";

// COBROS PENDIENTES ANTERIORES A APROBA (migración, columna «Estado del cobro» — Luis,
// 24/09/2026). Lo que el despacho facturó en su sistema anterior y aún no ha cobrado:
//   · trámites TERMINADOS importados → ServicioHistorico.cobro = PENDIENTE
//   · trámites EN CURSO importados   → Expediente.cobroPrevio = PENDIENTE
// NO son facturas de Aproba (ni numeración, ni AEAT, ni recordatorio con enlace de pago):
// se listan para perseguirlas y se marcan cobradas a mano. Sin la migración
// supabase/cobro-previo.sql, lista vacía (la página no se cae).

export type CobroPrevioPendiente = {
  tipo: "servicio" | "expediente";
  id: string;
  clienteId: string;
  cliente: string;
  concepto: string;
  importe: number | null; // null = el Excel decía «pendiente» sin importe
  fecha: string | null;   // fecha del trámite (corta)
  expedienteId: string | null;
};

type FilaCliente = { id: string; nombre: string | null; apellidos: string | null; oficinaId?: string | null };

export async function fetchCobrosPrevios(sedes?: string[] | null, incluirSinSede = false): Promise<CobroPrevioPendiente[]> {
  try {
    const supabase = await createSupabaseServer();
    const [hs, es] = await Promise.all([
      supabase.from("ServicioHistorico").select("id, clienteId, tipo, etiqueta, fecha, importe, referencia").eq("cobro", "PENDIENTE").limit(500),
      supabase.from("Expediente").select("id, clienteId, tipo, referencia, importePrevio, oficinaId").eq("cobroPrevio", "PENDIENTE").limit(500),
    ]);
    const servicios = hs.error ? [] : ((hs.data ?? []) as { id: string; clienteId: string; tipo: string; etiqueta: string | null; fecha: string | null; importe: number | string | null; referencia: string | null }[]);
    const expedientes = es.error ? [] : ((es.data ?? []) as { id: string; clienteId: string; tipo: string; referencia: string; importePrevio: number | string | null; oficinaId?: string | null }[]);
    if (!servicios.length && !expedientes.length) return [];

    const ids = [...new Set([...servicios.map((s) => s.clienteId), ...expedientes.map((e) => e.clienteId)])];
    let cli = await supabase.from("Cliente").select("id, nombre, apellidos, oficinaId").in("id", ids);
    if (cli.error) cli = await supabase.from("Cliente").select("id, nombre, apellidos").in("id", ids) as typeof cli;
    const clientes = new Map(((cli.data ?? []) as FilaCliente[]).map((c) => [c.id, c]));
    const nombre = (id: string) => { const c = clientes.get(id); return c ? [c.nombre, c.apellidos].filter(Boolean).join(" ") || "—" : "—"; };
    // Filtro de sede (pastilla de oficina): la del expediente, o la del cliente.
    const enSede = (oficinaId: string | null | undefined) =>
      !sedes ? true : oficinaId ? sedes.includes(oficinaId) : incluirSinSede;

    const out: CobroPrevioPendiente[] = [];
    for (const s of servicios) {
      if (!clientes.has(s.clienteId) || !enSede(clientes.get(s.clienteId)?.oficinaId)) continue;
      out.push({
        tipo: "servicio", id: s.id, clienteId: s.clienteId, cliente: nombre(s.clienteId),
        concepto: [s.etiqueta || TIPO_LABEL[s.tipo] || s.tipo, s.referencia].filter(Boolean).join(" · "),
        importe: s.importe != null && s.importe !== "" ? Number(s.importe) : null,
        fecha: fmtFechaCorta(s.fecha) ?? null, expedienteId: null,
      });
    }
    for (const e of expedientes) {
      if (!clientes.has(e.clienteId) || !enSede(e.oficinaId ?? clientes.get(e.clienteId)?.oficinaId)) continue;
      out.push({
        tipo: "expediente", id: e.id, clienteId: e.clienteId, cliente: nombre(e.clienteId),
        concepto: `${TIPO_LABEL[e.tipo] ?? "Expediente"} · ${e.referencia}`,
        importe: e.importePrevio != null && e.importePrevio !== "" ? Number(e.importePrevio) : null,
        // Sin fecha: la del expediente sería la del IMPORT, no la de la factura anterior.
        fecha: null, expedienteId: e.id,
      });
    }
    return out.sort((a, b) => a.cliente.localeCompare(b.cliente, "es"));
  } catch {
    return [];
  }
}
