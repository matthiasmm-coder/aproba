import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { googleOAuthDisponible, credencialDeWorkspace } from "@/lib/google-calendar";

// Estado de la integración Google del workspace del usuario:
//   configurado — las variables de entorno OAuth existen (plataforma lista)
//   conectado   — esta gestoría ya autorizó su cuenta de Google
// Lo consumen Ajustes y la modal de citas (para proponer el modo automático).
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const configurado = googleOAuthDisponible();
  let conectado = false;
  if (configurado) {
    const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
    if (mem) conectado = Boolean(await credencialDeWorkspace(createSupabaseAdmin(), mem.workspaceId as string));
  }
  return NextResponse.json({ configurado, conectado });
}
