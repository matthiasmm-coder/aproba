import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDespacho } from "@/lib/data/config";

// Lo que la sesión ya sabe del gestor, para prellenar el presupuesto de Aproba Despegue
// (ventana al terminar la guía). Nunca falla: sin datos, campos vacíos.
export type PrefillDespegue = { nombre: string; apellidos: string; despacho: string; email: string };
export async function fetchPrefillDespegue(supabase: SupabaseClient): Promise<PrefillDespegue> {
  try {
    const [{ data: { user } }, d] = await Promise.all([supabase.auth.getUser(), fetchDespacho()]);
    const completo = String(user?.user_metadata?.nombre ?? "").trim();
    const [nombre, ...resto] = completo.split(/\s+/);
    return { nombre: nombre ?? "", apellidos: resto.join(" "), despacho: d.nombre === "Mi despacho" ? "" : d.nombre, email: user?.email ?? "" };
  } catch { return { nombre: "", apellidos: "", despacho: "", email: "" }; }
}
