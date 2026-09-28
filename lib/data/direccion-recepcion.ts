import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { direccionEntrante, generarTokenEntrante } from "@/lib/email-entrante";

// Dirección de recepción por email del despacho (03/09/2026): el token vive en
// Workspace.emailEntranteToken; si la migración lo dejó vacío, se genera aquí una sola
// vez. Sin la columna (migración pendiente) → null y quien la pinta lo dice. La usan
// Ajustes › Integraciones (documentos por email) y la pestaña DEHú (avisos de la DEHú).
export async function fetchDireccionRecepcion(): Promise<{ direccion: string | null }> {
  try {
    const supabase = await createSupabaseServer();
    const { data: m, error } = await supabase.from("Membership").select("workspaceId, Workspace(emailEntranteToken)").limit(1).maybeSingle();
    if (error || !m) return { direccion: null };
    const wsRaw = (m as { Workspace?: { emailEntranteToken?: string | null } | { emailEntranteToken?: string | null }[] }).Workspace;
    const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
    let token = ws?.emailEntranteToken ?? null;
    if (!token) {
      token = generarTokenEntrante();
      const { error: eUp } = await createSupabaseAdmin().from("Workspace").update({ emailEntranteToken: token }).eq("id", m.workspaceId as string);
      if (eUp) return { direccion: null };
    }
    return { direccion: direccionEntrante(token) };
  } catch { return { direccion: null }; }
}
