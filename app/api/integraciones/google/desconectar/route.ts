import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { credencialDeWorkspace, revocarCredencial } from "@/lib/google-calendar";

// Desconecta Google del workspace: revoca el token en Google (best-effort) y borra
// la credencial. Las citas ya creadas conservan sus enlaces (siguen funcionando).
export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });

  const admin = createSupabaseAdmin();
  const enc = await credencialDeWorkspace(admin, mem.workspaceId as string);
  if (enc) await revocarCredencial(enc);
  const { error } = await admin.from("GoogleCalendarCuenta").delete().eq("workspaceId", mem.workspaceId as string);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
