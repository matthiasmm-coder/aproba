import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchServiciosConfig } from "@/lib/data/config";
import { TIPO_A_SERVICIO } from "@/lib/tramites";

// Agenda del despacho: citas PREVIAS (consulta, tabla CitaPrevia) + citas con la
// ADMINISTRACIÓN a las que acude el gestor (Expediente en CITA_HUELLAS cuyo servicio
// tiene citaQuien='gestor'). Todo con repli propre: si la tabla CitaPrevia aún no está
// migrada, simplemente no hay previas.

export type ItemAgenda = {
  id: string;
  tipo: "previa" | "administracion";
  fecha: string; // YYYY-MM-DD
  hora: string | null;
  lugar: string | null;
  clienteNombre: string;
  motivo?: string | null; // previa
  estado?: string | null; // previa
  clienteId?: string | null; // previa
  expedienteId?: string; // administracion (link)
  referencia?: string; // administracion
};

export type ClienteMin = { id: string; nombre: string; apellidos: string | null; email: string | null; telefono: string | null };

const hoy = () => new Date().toISOString().slice(0, 10);
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function fetchProximasCitas(): Promise<ItemAgenda[]> {
  const supabase = await createSupabaseServer();
  const today = hoy();
  const items: ItemAgenda[] = [];

  // (a) Citas previas próximas (no canceladas ni realizadas).
  try {
    const { data } = await supabase
      .from("CitaPrevia")
      .select("id, nombre, fecha, hora, lugar, motivo, estado, clienteId")
      .gte("fecha", today)
      .not("estado", "in", "(cancelada,realizada)")
      .order("fecha", { ascending: true })
      .limit(30);
    for (const c of data ?? []) {
      items.push({ id: c.id as string, tipo: "previa", fecha: c.fecha as string, hora: (c.hora as string) ?? null, lugar: (c.lugar as string) ?? null, clienteNombre: c.nombre as string, motivo: (c.motivo as string) ?? null, estado: (c.estado as string) ?? null, clienteId: (c.clienteId as string) ?? null });
    }
  } catch { /* tabla CitaPrevia no migrada → sin previas */ }

  // (b) Citas con la administración a las que acude EL GESTOR (citaQuien='gestor').
  try {
    const { servicios } = await fetchServiciosConfig();
    const quienPorClave: Record<string, string> = {};
    for (const s of servicios) quienPorClave[s.id] = s.citaQuien ?? "cliente";
    const { data } = await supabase
      .from("Expediente")
      .select("id, referencia, fechaCita, citaHora, citaLugar, tipo, servicioClave, cliente:Cliente(nombre, apellidos)")
      .eq("estado", "CITA_HUELLAS")
      .gte("fechaCita", today)
      .order("fechaCita", { ascending: true })
      .limit(30);
    for (const e of data ?? []) {
      const clave = (e.servicioClave as string) ?? TIPO_A_SERVICIO[e.tipo as string];
      if ((quienPorClave[clave] ?? "cliente") !== "gestor") continue;
      const cli = uno(e.cliente as { nombre: string | null; apellidos: string | null }[] | null);
      items.push({ id: e.id as string, tipo: "administracion", fecha: e.fechaCita as string, hora: (e.citaHora as string) ?? null, lugar: (e.citaLugar as string) ?? null, clienteNombre: `${cli?.nombre ?? ""} ${cli?.apellidos ?? ""}`.trim() || "Cliente", expedienteId: e.id as string, referencia: e.referencia as string });
    }
  } catch { /* sin citas de administración */ }

  items.sort((a, b) => (a.fecha + (a.hora ?? "99:99")).localeCompare(b.fecha + (b.hora ?? "99:99")));
  return items.slice(0, 12);
}

// Lista mínima de clientes del workspace, para vincular una cita previa.
export async function fetchClientesMin(): Promise<ClienteMin[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("Cliente").select("id, nombre, apellidos, email, telefono").order("nombre", { ascending: true }).limit(500);
  return (data ?? []) as ClienteMin[];
}
