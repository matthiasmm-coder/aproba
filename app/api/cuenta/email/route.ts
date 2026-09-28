import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { emailValido, firmarCambio, htmlConfirmar, normalizarEmail } from "@/lib/cambio-email";

// Pide el cambio del email de acceso: envía un enlace de confirmación al email NUEVO.
// Nada cambia hasta que se pulsa (ver /auth/confirmar-email y lib/cambio-email.ts).
// Los errores van como código: la pantalla los traduce (es/ca).
const fail = (codigo: string, status = 400) => NextResponse.json({ error: codigo }, { status });

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("sesion", 401);

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const nuevo = normalizarEmail(body.email);
  if (!emailValido(nuevo)) return fail("invalido");
  if (nuevo === normalizarEmail(user.email)) return fail("igual");

  const admin = createSupabaseAdmin();
  const { data: otros } = await admin.from("User").select("id").eq("email", nuevo).neq("id", user.id).limit(1);
  if (otros?.length) return fail("en_uso", 409);

  const link = `${baseUrlFromRequest(req)}/auth/confirmar-email?t=${encodeURIComponent(firmarCambio(user.id, nuevo))}`;
  if (process.env.RESEND_API_KEY) {
    const from = `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: nuevo, subject: "Confirma tu nuevo email de Aproba",
      html: htmlConfirmar(link, nuevo), text: `Confirma tu nuevo email de acceso a Aproba (caduca en 1 hora): ${link}`,
    });
    if (error) {
      console.error("[cambio-email] resend", error.message ?? error);   // sin el email: PII
      return fail("envio", 502);
    }
  } else {
    console.log("[cambio-email SIMULADO] link:", link);
  }
  return NextResponse.json({ ok: true, email: nuevo });
}
