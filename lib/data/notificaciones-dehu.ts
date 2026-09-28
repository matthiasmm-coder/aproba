import { createSupabaseServer } from "@/lib/supabase/server";
import { leerPaginado } from "@/lib/supabase/paginar";
import { COLS_NOTIFICACION, mapFilaNotificacion, type NotificacionDehu } from "@/lib/notificaciones-dehu";

// NOTIFICACIONES DE LA DEHú — data layer. Lectura BAJO SESIÓN (RLS: el despacho, y una
// notificación ya vinculada sigue la sede de su expediente). Sin la migración, la pestaña
// lo dice y la ficha y la campana siguen como si no hubiera nada.

const faltaTabla = (m: string) => /NotificacionDehu|relation|schema cache|does not exist|PGRST205/i.test(m);

export async function fetchNotificacionesDehu(): Promise<{ faltaMigracion: boolean; items: NotificacionDehu[] }> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("NotificacionDehu").select(COLS_NOTIFICACION).order("createdAt", { ascending: false }).limit(500);
  if (error) return { faltaMigracion: faltaTabla(error.message), items: [] };
  return { faltaMigracion: false, items: (data ?? []).map((r) => mapFilaNotificacion(r as Record<string, unknown>)) };
}

// Las de UN expediente (sección «Estado en Extranjería» de la ficha).
export async function fetchNotificacionesDeExpediente(expedienteId: string): Promise<NotificacionDehu[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("NotificacionDehu").select(COLS_NOTIFICACION).eq("expedienteId", expedienteId).order("createdAt", { ascending: false }).limit(50);
    if (error) return [];
    return (data ?? []).map((r) => mapFilaNotificacion(r as Record<string, unknown>));
  } catch { return []; }
}

// Lo que la campana debe enseñar: sin gestionar (pendientes y los requerimientos ya
// vinculados que aún no se han registrado).
export async function fetchNotificacionesParaAlertas(): Promise<NotificacionDehu[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("NotificacionDehu").select(COLS_NOTIFICACION).in("estado", ["PENDIENTE", "VINCULADA"]).order("createdAt", { ascending: false }).limit(200);
    if (error) return [];
    return (data ?? []).map((r) => mapFilaNotificacion(r as Record<string, unknown>));
  } catch { return []; }
}

// Expedientes a los que se puede vincular: TAMBIÉN los archivados — en el flujo v4 un
// expediente presentado se archiva «en trámite», y es justo el que recibe el requerimiento
// o la resolución. Primero los vivos; buscador en el navegador.
export type ExpedienteParaDehu = { id: string; referencia: string; cliente: string; numeroOficial: string | null; archivado: boolean };
export async function fetchExpedientesParaDehu(): Promise<ExpedienteParaDehu[]> {
  const supabase = await createSupabaseServer();
  // Los 5.000 más recientes (5 páginas de 1.000, el tope de la API).
  const leer = (cols: string) => leerPaginado<Record<string, unknown>>((d, h) => supabase.from("Expediente").select(cols).order("createdAt", { ascending: false }).order("id").range(d, h), 5);
  let r = await leer("id, referencia, numeroOficial, archivadoAt, cliente:Cliente(nombre, apellidos), empresa:Empresa(razonSocial)");
  if (r.error) r = await leer("id, referencia, archivadoAt, cliente:Cliente(nombre, apellidos)");
  type Fila = { id: string; referencia: string; numeroOficial?: string | null; archivadoAt: string | null; cliente: unknown; empresa?: unknown };
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const lista = (r.data as unknown as Fila[]).map((e) => {
    const c = uno(e.cliente as { nombre?: string | null; apellidos?: string | null } | null);
    const emp = uno(e.empresa as { razonSocial?: string | null } | null);
    const cliente = `${c?.nombre ?? ""} ${c?.apellidos ?? ""}`.trim() || emp?.razonSocial || "";
    return { id: e.id, referencia: e.referencia, cliente, numeroOficial: e.numeroOficial ?? null, archivado: Boolean(e.archivadoAt) };
  });
  return [...lista.filter((e) => !e.archivado), ...lista.filter((e) => e.archivado)];
}
