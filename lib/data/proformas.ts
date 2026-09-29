import { createSupabaseServer } from "@/lib/supabase/server";
import { COLS_PROFORMA, mapFilaProforma, type Proforma } from "@/lib/proformas";

// FACTURAS PROFORMA (29/09/2026) — lectura BAJO SESIÓN (RLS: la regla de las facturas) y con
// la sede de la pastilla activa, como la lista de facturas. Sin la tabla (migración
// pendiente) la pestaña lo dice en vez de romper la página.
const faltaTabla = (msg: string) => /Proforma|relation|schema cache|does not exist|PGRST205/i.test(msg);

export async function fetchProformas(sedes?: string[] | null, incluirSinSede = false): Promise<{ items: Proforma[]; faltaMigracion: boolean }> {
  const supabase = await createSupabaseServer();
  let q = supabase.from("Proforma").select(COLS_PROFORMA);
  if (sedes?.length) {
    const dentro = `oficinaId.in.(${sedes.join(",")})`;
    q = q.or(incluirSinSede ? `${dentro},oficinaId.is.null` : dentro);
  }
  const { data, error } = await q.order("createdAt", { ascending: false }).limit(1000);
  if (error) {
    if (faltaTabla(error.message)) return { items: [], faltaMigracion: true };
    throw new Error(`Proformas: ${error.message}`);
  }
  return { items: ((data ?? []) as Record<string, unknown>[]).map(mapFilaProforma), faltaMigracion: false };
}

export async function fetchProforma(id: string): Promise<Proforma | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("Proforma").select(COLS_PROFORMA).eq("id", id).maybeSingle();
  if (error) {
    if (faltaTabla(error.message)) return null;
    throw new Error(`Proforma: ${error.message}`);
  }
  return data ? mapFilaProforma(data as Record<string, unknown>) : null;
}
