import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";

// Reset de contraseña : génère un lien de récupération (admin) et l'envoie par
// Resend (domaine vérifié). On répond TOUJOURS { ok: true } pour ne pas révéler
// si l'email correspond à un compte existant.
function resetHtml(link: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <p style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 16px">Aproba</p>
  <p style="font-size:15px;line-height:1.6;margin:0">Has solicitado restablecer tu contraseña. Pulsa el botón para elegir una nueva. Si no has sido tú, ignora este correo.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#0E8C5F;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block">Restablecer mi contraseña</a></p>
  <p style="font-size:12px;color:#94a3b8;margin:0">Este enlace caduca en 1 hora. Si el botón no funciona, copia esta dirección en tu navegador:<br>${link}</p>
</div>`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const correo = String(body.email ?? "").trim().toLowerCase();
  if (!correo || !/.+@.+\..+/.test(correo)) return NextResponse.json({ ok: true });

  try {
    const admin = createSupabaseAdmin();
    const origin = baseUrlFromRequest(req);
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: correo,
      options: { redirectTo: `${origin}/auth/reset` },
    });
    const link = data?.properties?.action_link;
    if (error || !link) {
      // compte inexistant (ou autre) → on ne révèle rien
      console.log("[forgot-password] no link for", correo, error?.message ?? "");
      return NextResponse.json({ ok: true });
    }
    if (process.env.RESEND_API_KEY) {
      const from = `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error: mailErr } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: correo, subject: "Restablece tu contraseña de Aproba",
        html: resetHtml(link), text: `Restablece tu contraseña de Aproba: ${link}`,
      });
      if (mailErr) console.error("[forgot-password] resend", mailErr.message ?? mailErr);
    } else {
      console.log("[forgot-password SIMULADO] link:", link);
    }
  } catch (e) {
    console.error("[forgot-password]", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
