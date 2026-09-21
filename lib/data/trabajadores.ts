import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { nombreCompleto, type TrabajadorExpediente } from "@/lib/trabajadores";

// Trabajadores de un EXPEDIENTE DE EMPRESA (tabla ExpedienteTrabajador, migración
// supabase/expediente-trabajadores.sql). Lectura TOLERANTE: sin la migración (tabla o
// columna ausentes) devuelve [] y nada se rompe — igual que empresaDeExpediente.
//
// Acepta el cliente Supabase que toque: el de sesión (RLS, páginas) o el admin (rutas que
// ya validaron el expediente bajo RLS y luego escriben con service_role).

// Sin nacionalidad/telefono/email duplicados: ya están en FICHA_KEYS.
const SEL = `id, clienteId, token, enlaceEnviadoAt, presentadoAt, createdAt, cliente:Cliente(id, ${FICHA_KEYS.join(", ")})`;

type Fila = {
  id: string; clienteId: string; token: string | null; enlaceEnviadoAt: string | null; presentadoAt: string | null; createdAt: string;
  cliente: (Record<string, string | null> & { id: string; nombre: string }) | (Record<string, string | null> & { id: string; nombre: string })[] | null;
};

function mapear(f: Fila): TrabajadorExpediente | null {
  const c = Array.isArray(f.cliente) ? f.cliente[0] ?? null : f.cliente;
  if (!c) return null; // cliente borrado a la vez (cascade): no debería verse
  const ficha: ClienteFicha = {};
  for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
  return {
    id: c.id,
    filaId: f.id,
    nombre: nombreCompleto({ nombre: c.nombre, apellidos: c.apellidos }),
    email: c.email ?? null,
    telefono: c.telefono ?? null,
    nacionalidad: c.nacionalidad ?? null,
    token: f.token ?? null,
    enlaceEnviadoAt: f.enlaceEnviadoAt ?? null,
    presentadoAt: f.presentadoAt ?? null,
    ficha,
  };
}

export async function fetchTrabajadoresDeExpediente(
  expedienteId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, any, any>,
): Promise<TrabajadorExpediente[]> {
  try {
    const sb = supabase ?? (await createSupabaseServer());
    const { data, error } = await sb
      .from("ExpedienteTrabajador")
      .select(SEL)
      .eq("expedienteId", expedienteId)
      .order("createdAt", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as Fila[]).map(mapear).filter((x): x is TrabajadorExpediente => x !== null);
  } catch {
    return [];
  }
}

// Recuento por expediente para el tablero (una sola consulta, RLS acota al despacho).
// Solo se piden los expedientes de la lista; sin migración → mapa vacío.
export async function contarTrabajadores(
  expedienteIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, any, any>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!expedienteIds.length) return out;
  try {
    const sb = supabase ?? (await createSupabaseServer());
    const { data, error } = await sb.from("ExpedienteTrabajador").select("expedienteId").in("expedienteId", expedienteIds);
    if (error || !data) return out;
    for (const r of data as { expedienteId: string }[]) out.set(r.expedienteId, (out.get(r.expedienteId) ?? 0) + 1);
    return out;
  } catch {
    return out;
  }
}

// Una fila concreta (expediente + trabajador), para quitar/marcar. null si no está.
export async function fetchFilaTrabajador(
  expedienteId: string,
  clienteId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, any, any>,
): Promise<{ id: string; token: string | null; presentadoAt: string | null } | null> {
  try {
    const sb = supabase ?? (await createSupabaseServer());
    const { data, error } = await sb.from("ExpedienteTrabajador").select("id, token, presentadoAt").eq("expedienteId", expedienteId).eq("clienteId", clienteId).maybeSingle();
    if (error || !data) return null;
    return data as { id: string; token: string | null; presentadoAt: string | null };
  } catch {
    return null;
  }
}
