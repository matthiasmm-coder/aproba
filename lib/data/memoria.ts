import { createSupabaseServer } from "@/lib/supabase/server";
import { construirMemoria, type FilaEvento, type FilaExpediente, type Memoria } from "@/lib/memoria";

// Lectura de la memoria de actividad (art. 8.1.f). Todo pasa por createSupabaseServer:
// la RLS acota al workspace del usuario, incluidos los eventos (evt_tenant cuelga de
// Expediente.workspaceId), así que no hace falta filtrar por workspace a mano.
//
// Un expediente entra en el período si se dio de alta dentro O si tuvo alguna actuación
// dentro. Por eso NO se filtra Expediente por fecha en SQL: se traen los del despacho y
// el módulo puro decide. El tope existe para no reventar el servidor en un histórico
// largo; si se alcanza, la memoria lo DICE (regla «no silent caps»).

export const TOPE_MEMORIA = 5000;

export type MemoriaConAviso = Memoria & { truncada: boolean };

// Cadena de replis: servicioClave y oficinaId son migraciones posteriores al esquema
// inicial; sin ellas la memoria sale igual, solo que agrupada por el tipo oficial.
const SELECTS = [
  "id, createdAt, tipo, servicioClave, estado, salida, fechaPresentacion, clienteId, oficinaId, cliente:Cliente(nacionalidad)",
  "id, createdAt, tipo, servicioClave, estado, fechaPresentacion, clienteId, oficinaId, cliente:Cliente(nacionalidad)",
  "id, createdAt, tipo, servicioClave, estado, fechaPresentacion, clienteId, cliente:Cliente(nacionalidad)",
  "id, createdAt, tipo, estado, fechaPresentacion, clienteId, cliente:Cliente(nacionalidad)",
  "id, createdAt, tipo, estado, fechaPresentacion, clienteId",
];

type Cru = Record<string, unknown> & { cliente?: { nacionalidad?: string | null } | { nacionalidad?: string | null }[] | null };

export async function fetchMemoria(desde: string, hasta: string): Promise<MemoriaConAviso> {
  const supabase = await createSupabaseServer();

  let filas: Cru[] = [];
  for (const sel of SELECTS) {
    const { data, error } = await supabase.from("Expediente").select(sel).limit(TOPE_MEMORIA + 1);
    if (!error) { filas = (data ?? []) as unknown as Cru[]; break; }
  }
  const truncada = filas.length > TOPE_MEMORIA;
  if (truncada) filas = filas.slice(0, TOPE_MEMORIA);

  const expedientes: FilaExpediente[] = filas.map((f) => {
    const cRaw = f.cliente;
    const c = Array.isArray(cRaw) ? cRaw[0] : cRaw;
    return {
      id: String(f.id),
      createdAt: String(f.createdAt ?? ""),
      tipo: String(f.tipo ?? "OTRO"),
      servicioClave: (f.servicioClave as string | null) ?? null,
      estado: String(f.estado ?? ""),
      salida: (f.salida as string | null) ?? null,
      fechaPresentacion: (f.fechaPresentacion as string | null) ?? null,
      clienteId: String(f.clienteId ?? ""),
      oficinaId: (f.oficinaId as string | null) ?? null,
      nacionalidad: c?.nacionalidad ?? null,
    };
  });

  // `hasta` es inclusivo para el usuario ("hasta el 31/12"), pero createdAt lleva hora:
  // se pide hasta el día siguiente en exclusiva y el módulo puro recorta por fecha.
  const finExclusivo = new Date(`${hasta}T00:00:00Z`);
  finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1);
  const [evRes, svcRes, memRes, ofiRes] = await Promise.all([
    supabase.from("ExpedienteEvento").select("expedienteId, tipo, createdAt")
      .gte("createdAt", `${desde}T00:00:00.000Z`).lt("createdAt", finExclusivo.toISOString()).limit(50000),
    supabase.from("ServicioConfig").select("clave, label"),
    supabase.from("Membership").select("role"),
    supabase.from("Oficina").select("id"),
  ]);

  const eventos: FilaEvento[] = (evRes.data ?? []).map((v) => ({
    expedienteId: String((v as { expedienteId: string }).expedienteId),
    tipo: String((v as { tipo: string }).tipo),
    createdAt: String((v as { createdAt: string }).createdAt),
  }));

  const servicios: Record<string, string> = {};
  for (const s of (svcRes.data ?? []) as { clave: string; label: string }[]) {
    if (s?.clave && s?.label) servicios[s.clave] = s.label;
  }

  const miembros = ((memRes.data ?? []) as { role: string }[]).map((m) => ({ role: String(m.role ?? "GESTOR") }));
  const sedes = ofiRes.error ? 0 : (ofiRes.data ?? []).length;

  return { ...construirMemoria({ desde, hasta, expedientes, eventos, servicios, miembros, sedes }), truncada };
}
