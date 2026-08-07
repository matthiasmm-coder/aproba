import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { verificarState, intercambiarCodigo, cifrarCredencial } from "@/lib/google-calendar";

// Retorno del consentimiento de Google. La autoridad es el STATE firmado por
// nosotros (workspace + HMAC + 10 min): no dependemos de la cookie de sesión,
// que en algún navegador puede no viajar en esta redirección cross-site.
export async function GET(req: Request) {
  const base = baseUrlFromRequest(req);
  const aAjustes = (code: string) => NextResponse.redirect(`${base}/app/ajustes?google=${code}`);

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return aAjustes("denegado"); // el gestor canceló
  const code = url.searchParams.get("code") ?? "";
  const workspaceId = verificarState(url.searchParams.get("state") ?? "");
  if (!code || !workspaceId) return aAjustes("error");

  const r = await intercambiarCodigo(code, `${base}/api/integraciones/google/callback`);
  if ("error" in r) {
    console.error("[google/callback]", r.error);
    return aAjustes("error");
  }

  const admin = createSupabaseAdmin();
  const ahora = new Date().toISOString();
  const { error } = await admin.from("GoogleCalendarCuenta").upsert({
    workspaceId,
    credencialEnc: cifrarCredencial(r.refreshToken),
    activa: true,
    updatedAt: ahora,
  }, { onConflict: "workspaceId" });
  if (error) {
    // Tabla sin migrar (supabase/google-calendar.sql) u otro fallo de escritura.
    console.error("[google/callback]", error.message);
    return aAjustes("sinmigrar");
  }
  return aAjustes("ok");
}
