import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Contexto común de las rutas de /api/proformas: usuario, despacho y, si se pasa un id, que
// ESE usuario vea la proforma bajo RLS (sedes, asistentes) antes de tocarla con el admin.
export async function contextoProforma(id?: string): Promise<
  | { ok: true; admin: ReturnType<typeof createSupabaseAdmin>; userId: string; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "No autenticado." };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { ok: false, status: 403, error: "No se encontró tu despacho." };
  const workspaceId = (mem as { workspaceId: string }).workspaceId;
  if (id) {
    const { data: visible, error } = await supabase.from("Proforma").select("id, workspaceId").eq("id", id).maybeSingle();
    if (error && /Proforma|relation|schema cache|does not exist|PGRST205/i.test(error.message)) return { ok: false, status: 500, error: "Falta la migración: ejecuta supabase/proformas.sql." };
    if (!visible || (visible as { workspaceId: string }).workspaceId !== workspaceId) return { ok: false, status: 404, error: "Proforma no encontrada." };
  }
  return { ok: true, admin, userId: user.id, workspaceId };
}
