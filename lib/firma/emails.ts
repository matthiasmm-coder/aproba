import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLayout, emailsAdministradores, fotoDelExpediente, resendDisponible } from "@/lib/notificaciones";
import { logoDelExpediente } from "@/lib/marca";
import { esLangSoportada, makeT, type Lang } from "@/lib/portal-i18n";
import type { SobreFila } from "@/lib/firma/servicio";
import { OTP_MINUTOS, type DocSobre } from "@/lib/firma/sobre";

// LOS CORREOS de la firma en línea, en el idioma del firmante (los del despacho, en español).
// Remitente = el nombre del despacho; nunca «no respondas».

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const desde = (gestoria: string) => `"${gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
const primerNombre = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

async function contexto(admin: SupabaseClient, sobre: SobreFila) {
  const { data } = await admin.from("Expediente").select("referencia, portalToken, Workspace(nombre)").eq("id", sobre.expedienteId).maybeSingle();
  const e = data as { referencia: string; portalToken: string | null; Workspace: { nombre: string } | { nombre: string }[] | null } | null;
  const gestoria = (Array.isArray(e?.Workspace) ? e?.Workspace[0] : e?.Workspace)?.nombre ?? "Tu gestoría";
  const lang = (esLangSoportada(sobre.idioma) ? sobre.idioma : "es") as Lang;
  return { gestoria, referencia: e?.referencia ?? "", portalToken: e?.portalToken ?? null, lang, t: makeT(lang) };
}
const nombreDoc = (t: ReturnType<typeof makeT>, d: DocSobre) => t(`firmaE.doc.${d.doc}`);
function listaDocs(t: ReturnType<typeof makeT>, docs: DocSobre[]) {
  const li = docs.map((d) => `<li style="margin:4px 0">${esc(nombreDoc(t, d))}</li>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td style="text-align:left"><ul style="margin:0;padding-left:20px;font-family:${FUENTE};font-size:15px;color:#1e293b">${li}</ul></td></tr></table>`;
}
async function enviar(o: { from: string; to: string | string[]; subject: string; html: string; text: string; replyTo?: string | null; attachments?: { filename: string; content: Buffer }[] }) {
  if (!resendDisponible()) return { enviado: false as const, simulado: true };
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: o.from, to: o.to, subject: o.subject, html: o.html, text: o.text,
    ...(o.replyTo ? { replyTo: o.replyTo } : {}), ...(o.attachments?.length ? { attachments: o.attachments } : {}),
  });
  if (error) { console.error("[firma email]", error.message ?? error); return { enviado: false as const, simulado: false }; }
  return { enviado: true as const, simulado: false };
}
const fechaCorta = (iso: string | null, lang: Lang) => (iso ? new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : lang, { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" }) : "");

// 1) La petición de firma (y sus recordatorios, con otro asunto e introducción).
export async function enviarSolicitudFirma(admin: SupabaseClient, sobre: SobreFila, o: { baseUrl: string; recordatorio?: boolean; replyTo?: string | null }) {
  const c = await contexto(admin, sobre);
  const url = `${o.baseUrl.replace(/\/$/, "")}/firma/${sobre.token}`;
  const clave = o.recordatorio ? "firmaE.mail.recordatorio" : "firmaE.mail.solicitud";
  const nombre = primerNombre(sobre.firmanteNombre);
  const hola = nombre ? c.t("firmaE.mail.hola", { nombre }) : c.t("firmaE.mail.holaSin");
  const intro = c.t(`${clave}.intro`, { gestoria: c.gestoria });
  const html = emailLayout({
    avatarUrl: await fotoDelExpediente(admin, sobre.expedienteId), logoUrl: await logoDelExpediente(admin, sobre.expedienteId),
    gestoria: c.gestoria, titulo: c.t("firmaE.mail.solicitud.titulo"),
    cuerpoHtml: `<p style="margin:0 0 8px">${esc(hola)}</p><p style="margin:0 0 12px">${esc(intro)}</p>${listaDocs(c.t, sobre.documentos)}<p style="margin:14px 0 0;font-size:13px;color:#64748b">${esc(c.t("firmaE.mail.caduca", { fecha: fechaCorta(sobre.expiraAt, c.lang) }))}</p>`,
    cta: { url, label: c.t("firmaE.mail.boton") },
    footerNota: c.t("firmaE.mail.pie", { gestoria: c.gestoria }),
    preheader: intro,
  });
  return enviar({
    from: desde(c.gestoria), to: sobre.firmanteEmail ?? "", replyTo: o.replyTo,
    subject: c.t(`${clave}.asunto`, { gestoria: c.gestoria }), html,
    text: `${hola}\n${intro}\n\n${sobre.documentos.map((d) => `- ${nombreDoc(c.t, d)}`).join("\n")}\n\n${c.t("firmaE.mail.boton")}: ${url}`,
  });
}

// 2) El código de un solo uso.
export async function enviarCodigoFirma(admin: SupabaseClient, sobre: SobreFila, codigo: string) {
  const c = await contexto(admin, sobre);
  const caja = `<div style="margin:6px auto 14px;display:inline-block;padding:14px 22px;border-radius:12px;background:#f1f5f9;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#0f172a">${codigo}</div>`;
  const html = emailLayout({
    logoUrl: await logoDelExpediente(admin, sobre.expedienteId),
    gestoria: c.gestoria, titulo: c.t("firmaE.mail.codigo.titulo"),
    cuerpoHtml: `${caja}<p style="margin:0 0 10px">${esc(c.t("firmaE.mail.codigo.texto", { minutos: OTP_MINUTOS }))}</p><p style="margin:0;font-size:13px;color:#64748b">${esc(c.t("firmaE.mail.codigo.aviso", { gestoria: c.gestoria }))}</p>`,
    footerNota: c.t("firmaE.mail.pie", { gestoria: c.gestoria }),
    preheader: c.t("firmaE.mail.codigo.asunto", { codigo }),
  });
  return enviar({
    from: desde(c.gestoria), to: sobre.firmanteEmail ?? "",
    subject: c.t("firmaE.mail.codigo.asunto", { codigo }), html,
    text: `${codigo}\n\n${c.t("firmaE.mail.codigo.texto", { minutos: OTP_MINUTOS })}\n${c.t("firmaE.mail.codigo.aviso", { gestoria: c.gestoria })}`,
  });
}

// 3) La copia firmada para el firmante, con los PDF adjuntos.
export async function enviarCopiaFirmada(admin: SupabaseClient, sobre: SobreFila, adjuntos: { filename: string; content: Buffer }[], o: { baseUrl: string; replyTo?: string | null }) {
  const c = await contexto(admin, sobre);
  const html = emailLayout({
    avatarUrl: await fotoDelExpediente(admin, sobre.expedienteId), logoUrl: await logoDelExpediente(admin, sobre.expedienteId),
    gestoria: c.gestoria, titulo: c.t("firmaE.mail.copia.titulo"),
    cuerpoHtml: `<p style="margin:0 0 12px">${esc(c.t("firmaE.mail.copia.texto", { gestoria: c.gestoria }))}</p>${listaDocs(c.t, sobre.documentos)}`,
    cta: c.portalToken ? { url: `${o.baseUrl.replace(/\/$/, "")}/s/${c.portalToken}`, label: c.t("firmaE.volver") } : null,
    footerNota: c.t("firmaE.mail.pie", { gestoria: c.gestoria }),
    preheader: c.t("firmaE.mail.copia.texto", { gestoria: c.gestoria }),
  });
  return enviar({
    from: desde(c.gestoria), to: sobre.firmanteEmail ?? "", replyTo: o.replyTo,
    subject: c.t("firmaE.mail.copia.asunto", { gestoria: c.gestoria }), html,
    text: `${c.t("firmaE.mail.copia.texto", { gestoria: c.gestoria })}\n${sobre.documentos.map((d) => `- ${nombreDoc(c.t, d)}`).join("\n")}`,
    attachments: adjuntos,
  });
}

// 4) Al despacho (todos los administradores): firmado, con el enlace al expediente.
export async function avisarFirmaAlDespacho(admin: SupabaseClient, sobre: SobreFila, o: { baseUrl: string }) {
  // En local no se escribe al despacho: el enlace llevaría a localhost (llegaría muerto).
  if (/localhost|127\.0\.0\.1/.test(o.baseUrl)) { console.log("[firma] aviso al despacho omitido en local"); return { enviado: false as const, simulado: true }; }
  const c = await contexto(admin, sobre);
  const destinatarios = await emailsAdministradores(admin, sobre.workspaceId);
  if (!destinatarios.length) return { enviado: false as const, simulado: false };
  const titulos = sobre.documentos.map((d) => d.titulo).join(", ");
  const url = `${o.baseUrl.replace(/\/$/, "")}/app/expedientes/${sobre.expedienteId}`;
  const texto = `${sobre.firmanteNombre ?? "El cliente"} ha firmado en línea (código verificado en ${sobre.firmanteEmail}): ${titulos}. Los documentos firmados, con su certificado de firma, ya están en el expediente ${c.referencia}.`;
  const html = emailLayout({
    avatarUrl: await fotoDelExpediente(admin, sobre.expedienteId),
    gestoria: c.gestoria, titulo: "Documentos firmados",
    cuerpoHtml: `<p style="margin:0">${esc(texto)}</p>`,
    cta: { url, label: "Ver el expediente" },
    footerNota: `Aviso de Aproba para ${c.gestoria}.`,
    preheader: texto,
  });
  return enviar({ from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`, to: destinatarios, subject: `✍️ ${sobre.firmanteNombre ?? "El cliente"} ha firmado: ${titulos}`, html, text: `${texto}\n\n${url}` });
}
