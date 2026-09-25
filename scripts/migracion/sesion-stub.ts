// Sustituto de «@/lib/supabase/server» para ejecutar la ruta REAL de import
// (/api/importar/ejecutar) fuera de Next, desde los guiones de migración.
// Solo responde «quién importa y en qué despacho» (MIGRA_USER, MIGRA_WS): la ruta escribe
// todo con createSupabaseAdmin, como en producción. Sin las dos variables, no sirve de nada.
const WS = process.env.MIGRA_WS ?? "";
const USER = process.env.MIGRA_USER ?? "";

export async function createSupabaseServer() {
  if (!WS || !USER) throw new Error("sesion-stub: faltan MIGRA_WS y MIGRA_USER");
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: (tabla: string) => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => {
      if (tabla !== "Membership") throw new Error(`sesion-stub: tabla inesperada ${tabla}`);
      return { data: { workspaceId: WS }, error: null };
    } }) }) }) }),
  };
}
export const __STUB_MIGRACION__ = true;
