import { Resend } from "resend";
import { emailLayout, fotoDelOwner } from "@/lib/notificaciones";

// Correo de bienvenida a un miembro recién invitado, CON sus credenciales.
//
// Por qué existe: al invitar, la contraseña temporal solo aparecía en un recuadro
// verde de Ajustes. Si el administrador cerraba la ventana sin copiarla, la
// persona se quedaba sin poder entrar y había que buscarla a mano en la base
// (pasó con el equipo de Gesnet el 12/08). Ahora le llega también por correo.
//
// Fail-soft: si el envío falla, la invitación NO se deshace — el recuadro de
// Ajustes sigue enseñando las credenciales. Devuelve si se pudo enviar, para que
// la interfaz diga la verdad («enviado» vs «cópialas y pásaselas tú»).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export async function enviarInvitacion(opts: {
  admin: Admin;
  workspaceId: string;
  gestoria: string;
  email: string;
  nombre: string;
  password: string;
  rolLabel: string;
  baseUrl: string;
}): Promise<boolean> {
  const { admin, workspaceId, gestoria, email, nombre, password, rolLabel, baseUrl } = opts;
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const avatarUrl = await fotoDelOwner(admin, workspaceId).catch(() => null);
    const login = `${baseUrl}/login`;
    const cuerpoHtml = `
      <p style="margin:0 0 14px">Hola ${escapar(nombre)},</p>
      <p style="margin:0 0 14px">Ya tienes acceso a <strong>${escapar(gestoria)}</strong> en Aproba, con el rol de <strong>${escapar(rolLabel)}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;border:1px solid #e6eae8;border-radius:12px;background:#f8faf9">
        <tr><td style="padding:16px 18px">
          <p style="margin:0 0 6px;font-size:13px;color:#64748b">Tu email</p>
          <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#0f172a">${escapar(email)}</p>
          <p style="margin:0 0 6px;font-size:13px;color:#64748b">Tu contraseña temporal</p>
          <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:0.5px;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapar(password)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px">Entra y <strong>cámbiala por una tuya</strong> desde Ajustes → Despacho y cuenta.</p>`;

    const html = emailLayout({
      gestoria,
      titulo: "Ya puedes entrar en Aproba",
      cuerpoHtml,
      cta: { url: login, label: "Entrar en Aproba" },
      footerNota: "Si no esperabas este correo, puedes ignorarlo: sin la contraseña no se accede a nada.",
      avatarUrl,
      preheader: `Tu acceso a ${gestoria} en Aproba`,
    });

    const from = `"${gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: email,
      subject: `Tu acceso a ${gestoria} en Aproba`,
      html,
      text: `Hola ${nombre},\n\nYa tienes acceso a ${gestoria} en Aproba (rol: ${rolLabel}).\n\n`
        + `Email: ${email}\nContraseña temporal: ${password}\n\n`
        + `Entra en ${login} y cámbiala por una tuya desde Ajustes → Despacho y cuenta.`,
    });
    if (error) { console.error("[equipo] invitación no enviada", error.message); return false; }
    return true;
  } catch (e) {
    console.error("[equipo] invitación no enviada", e instanceof Error ? e.message : e);
    return false;
  }
}

// El nombre del despacho y el del miembro los escribe un humano: nunca van crudos al HTML.
function escapar(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
