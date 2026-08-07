import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { googleOAuthDisponible, probarConexion } from "@/lib/google-calendar";

// Estado de la integración Google del workspace del usuario:
//   configurado — las variables de entorno OAuth existen (plataforma lista)
//   conectado   — la gestoría autorizó su cuenta Y la conexión RESPONDE ahora mismo
//   caducada    — hay credencial guardada pero Google ya no la acepta (token de 7 días
//                 en modo Testing, o acceso revocado por el gestor) → hay que reconectar
// Lo consumen Ajustes y la modal de citas (para proponer el modo automático).
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const configurado = googleOAuthDisponible();
  let estado: "ok" | "caducada" | "sin_conexion" = "sin_conexion";
  if (configurado) {
    const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
    if (mem) estado = await probarConexion(createSupabaseAdmin(), mem.workspaceId as string);
  }
  return NextResponse.json({ configurado, conectado: estado === "ok", caducada: estado === "caducada" });
}
