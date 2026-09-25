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
  clienteId: string | null;
  empresaId?: string | null; // lo facturado a una empresa sin trabajador (25/09/2026)
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
    // `empresaId` (supabase/servicio-historico-empresa.sql): sin la migración se lee sin él.
    const leerServicios = async () => {
      const r = await supabase.from("ServicioHistorico").select("id, clienteId, empresaId, tipo, etiqueta, fecha, importe, referencia").eq("cobro", "PENDIENTE").limit(500);
      if (!r.error || !/empresaId/i.test(r.error.message)) return r;
      return await supabase.from("ServicioHistorico").select("id, clienteId, tipo, etiqueta, fecha, importe, referencia").eq("cobro", "PENDIENTE").limit(500) as unknown as typeof r;
    };
    const [hs, es] = await Promise.all([
      leerServicios(),
      supabase.from("Expediente").select("id, clienteId, tipo, referencia, importePrevio, oficinaId").eq("cobroPrevio", "PENDIENTE").limit(500),
    ]);
    const servicios = hs.error ? [] : ((hs.data ?? []) as unknown as { id: string; clienteId: string | null; empresaId?: string | null; tipo: string; etiqueta: string | null; fecha: string | null; importe: number | string | null; referencia: string | null }[]);
    const expedientes = es.error ? [] : ((es.data ?? []) as { id: string; clienteId: string | null; tipo: string; referencia: string; importePrevio: number | string | null; oficinaId?: string | null }[]);
    if (!servicios.length && !expedientes.length) return [];

    const ids = [...new Set([...servicios.map((s) => s.clienteId), ...expedientes.map((e) => e.clienteId)].filter((x): x is string => Boolean(x)))];
    let cli = await supabase.from("Cliente").select("id, nombre, apellidos, oficinaId").in("id", ids);
    if (cli.error) cli = await supabase.from("Cliente").select("id, nombre, apellidos").in("id", ids) as typeof cli;
    const clientes = new Map(((cli.data ?? []) as FilaCliente[]).map((c) => [c.id, c]));
    // Empresas cliente directa (servicio sin persona): su razón social hace de «cliente».
    const empIds = [...new Set(servicios.filter((s) => !s.clienteId && s.empresaId).map((s) => s.empresaId as string))];
    const emp = empIds.length ? await supabase.from("Empresa").select("id, razonSocial, oficinaId").in("id", empIds) : null;
    const empresas = new Map(((emp?.data ?? []) as { id: string; razonSocial: string | null; oficinaId?: string | null }[]).map((e) => [e.id, e]));
    const nombre = (id: string) => { const c = clientes.get(id); return c ? [c.nombre, c.apellidos].filter(Boolean).join(" ") || "—" : "—"; };
    // Filtro de sede (pastilla de oficina): la del expediente, o la del cliente.
    const enSede = (oficinaId: string | null | undefined) =>
      !sedes ? true : oficinaId ? sedes.includes(oficinaId) : incluirSinSede;

    const out: CobroPrevioPendiente[] = [];
    for (const s of servicios) {
      const em = !s.clienteId && s.empresaId ? empresas.get(s.empresaId) : undefined;
      if (em) {
        if (!enSede(em.oficinaId)) continue;
        out.push({
          tipo: "servicio", id: s.id, clienteId: null, empresaId: em.id, cliente: em.razonSocial || "—",
          concepto: [s.etiqueta || TIPO_LABEL[s.tipo] || s.tipo, s.referencia].filter(Boolean).join(" · "),
          importe: s.importe != null && s.importe !== "" ? Number(s.importe) : null,
          fecha: fmtFechaCorta(s.fecha) ?? null, expedienteId: null,
        });
        continue;
      }
      if (!s.clienteId || !clientes.has(s.clienteId) || !enSede(clientes.get(s.clienteId)?.oficinaId)) continue;
      out.push({
        tipo: "servicio", id: s.id, clienteId: s.clienteId, cliente: nombre(s.clienteId),
        concepto: [s.etiqueta || TIPO_LABEL[s.tipo] || s.tipo, s.referencia].filter(Boolean).join(" · "),
        importe: s.importe != null && s.importe !== "" ? Number(s.importe) : null,
        fecha: fmtFechaCorta(s.fecha) ?? null, expedienteId: null,
      });
    }
    for (const e of expedientes) {
      if (!e.clienteId || !clientes.has(e.clienteId) || !enSede(e.oficinaId ?? clientes.get(e.clienteId)?.oficinaId)) continue;
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
