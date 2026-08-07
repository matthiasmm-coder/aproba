import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { baseUrlFromRequest } from "@/lib/base-url";
import { googleOAuthDisponible, firmarState, urlConexionGoogle } from "@/lib/google-calendar";

// Inicio del flujo OAuth: redirige al consentimiento de Google con un state firmado
// (workspace + fecha, HMAC) que el callback verificará. Navegación de navegador
// (enlace desde Ajustes), por eso los errores vuelven a Ajustes con ?google=…
export async function GET(req: Request) {
  const base = baseUrlFromRequest(req);
  const aAjustes = (code: string) => NextResponse.redirect(`${base}/app/ajustes?google=${code}`);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);
  if (!googleOAuthDisponible()) return aAjustes("sinconfig");

  const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return aAjustes("error");

  const redirectUri = `${base}/api/integraciones/google/callback`;
  return NextResponse.redirect(urlConexionGoogle(redirectUri, firmarState(mem.workspaceId as string)));
}
