// HISTORIAL — leído en el SERVIDOR, carpeta a carpeta (19/09/2026).
//
// La pantalla ya no descarga el archivo entero: pide los RECUENTOS (servicio × año)
// para dibujar las carpetas, y las FILAS de una carpeta solo cuando el gestor la abre.
// Es lo que permite importar 15 años sin que la página se vuelva imposible — y lo que
// evita el plafond silencioso de los 800 expedientes más recientes.
//
// Las dos funciones viven en supabase/historial-resumen.sql. Si la migración aún no
// está aplicada devuelven `null`: la pantalla vuelve al modo anterior (archivo en el
// navegador) sin un solo error a la vista.

import { createSupabaseServer } from "@/lib/supabase/server";

export type ResumenHistorial = { servicio: string; tipo: string; anio: string; salida: string; asignado: string; n: number };
export type FilaHistorial = {
  id: string; referencia: string; cliente: string; empresa: string; tipo: string;
  servicio: string; salida: string; estado: string; presentacion: string; anio: string; asignado: string;
  numeroOficial?: string | null; // lo añade fetchHistorialFilas (la función SQL no lo devuelve)
};

const args = (sedes?: string[] | null, incluirSinSede = false) => ({
  p_oficinas: sedes?.length ? sedes : null,
  p_incluir_sin_sede: incluirSinSede,
});

// Recuentos del archivo. null = la función no existe todavía (migración pendiente).
export async function fetchHistorialResumen(sedes?: string[] | null, incluirSinSede = false): Promise<ResumenHistorial[] | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("historial_resumen", args(sedes, incluirSinSede));
  if (error) return null;
  return ((data ?? []) as { servicio: string; tipo: string; anio: string; salida: string; asignado: string; n: number | string }[])
    .map((r) => ({ ...r, n: Number(r.n) || 0 }));
}

export type FiltroFilas = {
  sedes?: string[] | null;
  incluirSinSede?: boolean;
  servicio?: string | null;  // "" = expedientes sin servicioClave
  tipo?: string | null;
  anio?: string | null;      // "" = sin fecha
  q?: string | null;
  asignado?: string | null;  // nombre del responsable
  salida?: string | null;    // categoría de salida ('' = sin clasificar)
  limit?: number;
  offset?: number;
};

// Filas de UNA carpeta (o de una búsqueda). null = migración pendiente.
export async function fetchHistorialFilas(f: FiltroFilas): Promise<FilaHistorial[] | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("historial_filas", {
    ...args(f.sedes, f.incluirSinSede ?? false),
    p_servicio: f.servicio ?? null,
    p_tipo: f.tipo ?? null,
    p_anio: f.anio ?? null,
    p_q: (f.q ?? "").trim() || null,
    p_asignado: f.asignado ?? null,
    p_salida: f.salida ?? null,
    p_limit: Math.min(Math.max(1, f.limit ?? 50), 200),
    p_offset: Math.max(0, f.offset ?? 0),
  });
  if (error) return null;
  const filas = (data ?? []) as FilaHistorial[];
  // Nº oficial de Extranjería (Jennifer, 24/09/2026): la función SQL no lo devuelve; se
  // completa con UNA consulta por los ids de la página (≤ 200). Sin la columna, sin él.
  if (filas.length) {
    const { data: nums, error: eNum } = await supabase.from("Expediente").select("id, numeroOficial").in("id", filas.map((f) => f.id));
    if (!eNum) {
      const porId = new Map(((nums ?? []) as { id: string; numeroOficial: string | null }[]).map((x) => [x.id, x.numeroOficial]));
      for (const f of filas) f.numeroOficial = porId.get(f.id) ?? null;
    }
  }
  return filas;
}
