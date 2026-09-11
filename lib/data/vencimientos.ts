import { createSupabaseServer } from "@/lib/supabase/server";
import { esVencimientoDeServicio } from "@/lib/renovacion-servicio";

// VIGÍA — data layer de la pantalla Vencimientos. Lectura BAJO SESIÓN (RLS):
// el tenant lo filtra la policy venc_tenant, no el código. Repli propre: si la
// tabla no está migrada aún, devuelve [] sin romper.

export type VencimientoRow = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  tipo: string;
  fecha: string; // ISO
  dias: number; // días hasta caducar (negativo = ya caducó)
  estado: string; // PENDIENTE | AVISADO | PROPUESTA | TRAMITANDO | RECHAZADA | SOLICITADO | HECHO
  esServicio: boolean; // TIE: se propone un trámite · pasaporte/NIE: se pide el documento nuevo
  clienteSinSede: boolean; // «Proponer renovación» debe pedir oficina (adopción del cliente)
  renovacion: { id: string; referencia: string } | null; // expediente de renovación (propuesto o en marcha)
  propuestaAt: string | null;
  respuestaCliente: "ACEPTADA" | "RECHAZADA" | null;
  respondidoAt: string | null;
  solicitadoAt: string | null;
  recibidoAt: string | null;
};

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// `oficinaId` = sede regardée (multi-oficina). Le vencimiento n'a pas de sede à lui :
// il suit celle de SON client, via un join interne (clienteId est NOT NULL, donc
// passer en `!inner` ne fait disparaître aucune ligne légitime).
export async function fetchVencimientos(sedes?: string[] | null, incluirSinSede = false): Promise<VencimientoRow[]> {
  const supabase = await createSupabaseServer();
  try {
    const EXTRA = ", propuestaAt, respuestaCliente, respondidoAt, solicitadoAt, recibidoAt";
    const base = (extra: string) => sedes?.length
      ? `id, clienteId, tipo, fecha, estado${extra}, cliente:Cliente!inner(nombre, apellidos, oficinaId), renovacion:Expediente!Vencimiento_expedienteRenovacionId_fkey(id, referencia)`
      : `id, clienteId, tipo, fecha, estado${extra}, cliente:Cliente(nombre, apellidos), renovacion:Expediente!Vencimiento_expedienteRenovacionId_fkey(id, referencia)`;
    const consulta = (extra: string) => {
      let q = supabase.from("Vencimiento").select(base(extra)).neq("estado", "HECHO");
      if (sedes?.length) {
        const dentro = `oficinaId.in.(${sedes.join(",")})`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (q as any).or(incluirSinSede ? `${dentro},oficinaId.is.null` : dentro, { referencedTable: "cliente" });
      }
      return q.order("fecha", { ascending: true }).limit(300);
    };
    // Columnas de vigia-propuesta.sql: sin la migración, la lista sigue saliendo (sin respuestas).
    let { data, error } = await consulta(EXTRA);
    if (error && /propuestaAt|respuestaCliente|solicitadoAt|recibidoAt|column|schema cache/i.test(error.message)) ({ data, error } = await consulta(""));
    if (error) throw error;
    const ahora = Date.now();
    return ((data ?? []) as unknown as {
      id: string; clienteId: string; tipo: string; fecha: string; estado: string;
      propuestaAt?: string | null; respuestaCliente?: string | null; respondidoAt?: string | null; solicitadoAt?: string | null; recibidoAt?: string | null;
      cliente: { nombre: string | null; apellidos: string | null; oficinaId?: string | null } | { nombre: string | null; apellidos: string | null; oficinaId?: string | null }[] | null;
      renovacion: { id: string; referencia: string } | { id: string; referencia: string }[] | null;
    }[]).map((v) => {
      const c = uno(v.cliente);
      const renovacion = uno(v.renovacion);
      // PROPUESTA/TRAMITANDO huérfano (expediente de renovación borrado → SetNull): se muestra
      // como PENDIENTE para que el botón «Proponer renovación» vuelva (la ruta lo re-reclama).
      const estado = (v.estado === "TRAMITANDO" || v.estado === "PROPUESTA") && !renovacion ? "PENDIENTE" : v.estado;
      return {
        id: v.id,
        clienteId: v.clienteId,
        clienteNombre: `${c?.nombre ?? "Cliente"} ${c?.apellidos ?? ""}`.trim(),
        tipo: v.tipo,
        fecha: v.fecha,
        dias: Math.ceil((new Date(v.fecha).getTime() - ahora) / 864e5),
        clienteSinSede: !c?.oficinaId,
        estado,
        esServicio: esVencimientoDeServicio(v.tipo),
        renovacion,
        propuestaAt: v.propuestaAt ?? null,
        respuestaCliente: v.respuestaCliente === "ACEPTADA" || v.respuestaCliente === "RECHAZADA" ? v.respuestaCliente : null,
        respondidoAt: v.respondidoAt ?? null,
        solicitadoAt: v.solicitadoAt ?? null,
        recibidoAt: v.recibidoAt ?? null,
      };
    });
  } catch {
    return []; // tabla sin migrar → pantalla vacía, sin romper
  }
}
