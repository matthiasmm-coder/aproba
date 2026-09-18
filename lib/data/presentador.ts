import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { presentadorDe, type FuentePresentador, type Presentador } from "@/lib/presentador";

// Datos del DESPACHO que presenta, para el bloque «Representante a efectos de
// presentación» de los formularios oficiales. Misma cascada que la hoja de encargo:
// la oficina del expediente manda sobre el despacho. RLS: el SELECT solo devuelve el
// workspace del gestor autenticado.
// Repli de columnas: una base anterior a la multi-oficina no tiene algunas, y un
// formulario sin bloque es mejor que un 500.

const COLS_WS = "nombre, nif, domicilio, domicilioActividad, emailFacturacion, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio";
const COLS_OF = "razonSocial, nombre, nif, domicilio, direccion, telefono, emailFacturacion, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio";

export async function fetchPresentador(
  supabase: SupabaseClient,
  oficinaId?: string | null,
): Promise<Presentador | null> {
  const ws = await supabase.from("Workspace").select(COLS_WS).limit(1).maybeSingle()
    .then((r) => (r.error ? supabase.from("Workspace").select("nombre, nif, domicilio, emailFacturacion, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio").limit(1).maybeSingle() : r))
    .then((r) => (r.error ? { data: null } : r));
  if (!ws.data) return null;
  let oficina: FuentePresentador | null = null;
  if (oficinaId) {
    const of = await supabase.from("Oficina").select(COLS_OF).eq("id", oficinaId).maybeSingle()
      .then((r) => (r.error ? { data: null } : r));
    oficina = (of.data as FuentePresentador | null) ?? null;
  }
  return presentadorDe(ws.data as FuentePresentador, oficina);
}

// Variante para los caminos SIN sesión (portal del cliente, ZIP, respuesta por email):
// el workspace no se deduce de la RLS, se pasa explícito.
export async function fetchPresentadorDeWorkspace(
  admin: SupabaseClient,
  workspaceId: string,
  oficinaId?: string | null,
): Promise<Presentador | null> {
  if (!workspaceId) return null;
  const ws = await admin.from("Workspace").select(COLS_WS).eq("id", workspaceId).maybeSingle()
    .then((r) => (r.error ? admin.from("Workspace").select("nombre, nif, domicilio, emailFacturacion, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio").eq("id", workspaceId).maybeSingle() : r))
    .then((r) => (r.error ? { data: null } : r));
  if (!ws.data) return null;
  let oficina: FuentePresentador | null = null;
  if (oficinaId) {
    const of = await admin.from("Oficina").select(COLS_OF).eq("id", oficinaId).maybeSingle()
      .then((r) => (r.error ? { data: null } : r));
    oficina = (of.data as FuentePresentador | null) ?? null;
  }
  return presentadorDe(ws.data as FuentePresentador, oficina);
}
