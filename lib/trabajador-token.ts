import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// ENLACE INDIVIDUAL DEL TRABAJADOR (lote 3, 21/09/2026): el token de ExpedienteTrabajador
// es la credencial de /t/<token> y de las rutas /api/trabajador/*. Abre SOLO lo suyo —
// sus documentos y su mandato — dentro del expediente de su empresa: nunca el token del
// expediente (que da la ficha completa, la empresa y el pago). No hay sesión.

export type TrabajadorPorToken = {
  filaId: string;
  clienteId: string;
  enlaceEnviadoAt: string | null;
  exp: {
    id: string; workspaceId: string; oficinaId: string | null; referencia: string; tipo: string; estado: string;
    servicioClave: string | null; serviciosExtra: string[] | null; docsExtra: unknown; serviciosAsignacion: unknown;
    empresaId: string | null; clienteId: string | null;
  };
  cliente: { id: string; nombre: string; apellidos: string | null; idioma: string | null; ficha: ClienteFicha };
};

export async function trabajadorPorToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  token: string,
): Promise<TrabajadorPorToken | null> {
  const t = String(token ?? "").trim();
  if (!/^[0-9a-f]{32}$/.test(t)) return null;
  const { data, error } = await admin
    .from("ExpedienteTrabajador")
    .select(`id, clienteId, enlaceEnviadoAt, expediente:Expediente(id, workspaceId, oficinaId, referencia, tipo, estado, servicioClave, serviciosExtra, docsExtra, serviciosAsignacion, empresaId, clienteId), cliente:Cliente(id, ${FICHA_KEYS.join(", ")}, idioma)`)
    .eq("token", t)
    .maybeSingle();
  if (error || !data) return null;
  // El select lleva FICHA_KEYS interpolado: el tipador de PostgREST no lo entiende → unknown.
  const fila = data as unknown as { id: string; clienteId: string; enlaceEnviadoAt?: string | null; expediente: unknown; cliente: unknown };
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const exp = uno(fila.expediente) as TrabajadorPorToken["exp"] | null;
  const c = uno(fila.cliente) as (Record<string, string | null> & { id: string; nombre: string }) | null;
  if (!exp || !c) return null;
  const ficha: ClienteFicha = {};
  for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
  return {
    filaId: String(fila.id),
    clienteId: String(fila.clienteId),
    enlaceEnviadoAt: fila.enlaceEnviadoAt ?? null,
    exp,
    cliente: { id: c.id, nombre: c.nombre ?? "", apellidos: c.apellidos ?? null, idioma: c.idioma ?? null, ficha },
  };
}
