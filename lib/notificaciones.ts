import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeT, type Lang } from "@/lib/portal-i18n";
import { DEFAULT_AVISOS } from "@/lib/avisos";

// Avisos automáticos au client (email réel via Resend, WhatsApp simulé pour l'instant).
// Conçu en « repli propre » : sans RESEND_API_KEY, l'email est rendu et JOURNALISÉ
// (estado SIMULADO) au lieu d'être envoyé — l'app fonctionne identiquement.
// Chaque aviso laisse une trace dans le historial de l'expediente (NOTIFICACION_ENVIADA),
// et rien ici ne doit jamais faire échouer le flux appelant (upload, paiement…).

export const resendDisponible = () => Boolean(process.env.RESEND_API_KEY);

type Estado = "ENVIADO" | "SIMULADO" | "SIN_CONTACTO" | "ERROR";

const primerNombre = (n: string) => (n || "").trim().split(/\s+/)[0] || (n || "cliente");
const render = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

function emailHtml(gestoria: string, cuerpo: string, portalUrl: string | null): string {
  const boton = portalUrl
    ? `<p style="margin:24px 0"><a href="${portalUrl}" style="background:#1f7a5a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">Acceder a mi expediente</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <p style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 16px">${gestoria}</p>
  <p style="font-size:15px;line-height:1.6;margin:0">${cuerpo}</p>
  ${boton}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">
  <p style="font-size:12px;color:#94a3b8;margin:0">Aviso automático de ${gestoria}. Por favor, no respondas a este correo.</p>
</div>`;
}

type ExpRow = {
  referencia: string;
  portalToken: string | null;
  Cliente: { nombre: string | null; email: string | null; telefono: string | null }
    | { nombre: string | null; email: string | null; telefono: string | null }[] | null;
  Workspace: { nombre: string | null } | { nombre: string | null }[] | null;
};
const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// Déclenche l'aviso `clave` pour un expediente, si l'aviso existe et est activo.
// `baseUrl` sert à construire le lien du portail dans l'email (origin de la requête).
export async function dispararAviso(
  admin: SupabaseClient,
  opts: { workspaceId: string; expedienteId: string; clave: string; vars?: Record<string, string>; baseUrl?: string },
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("AvisoConfig")
      .select("evento, template, canal, activo")
      .eq("workspaceId", opts.workspaceId)
      .eq("clave", opts.clave)
      .maybeSingle();
    // Repli sur le défaut si le workspace n'a pas (encore) personnalisé cet aviso →
    // les avisos fonctionnent out-of-the-box, sans config manuelle préalable.
    const def = DEFAULT_AVISOS.find((a) => a.id === opts.clave);
    const aviso = row ?? (def ? { evento: def.evento, template: def.template, canal: def.canal, activo: def.activo } : null);
    if (!aviso || !aviso.activo) return; // inconnu/non configuré ou désactivé → rien

    const { data: expRaw } = await admin
      .from("Expediente")
      .select("referencia, portalToken, Cliente(nombre, email, telefono), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as ExpRow | null;
    const cliente = uno(exp?.Cliente ?? null);
    const gestoria = uno(exp?.Workspace ?? null)?.nombre ?? "Tu gestoría";
    const nombre = cliente?.nombre ?? "cliente";
    const cuerpo = render(aviso.template, { nombre: primerNombre(nombre), ...(opts.vars ?? {}) });
    const portalUrl = exp?.portalToken && opts.baseUrl ? `${opts.baseUrl}/j/${exp.portalToken}` : null;

    // Email uniquement : l'envoi WhatsApp automatique n'existe pas (canal retiré d'Ajustes).
    let estado: Estado = "SIMULADO";
    const destino = cliente?.email ?? "";
    if (!destino) {
      estado = "SIN_CONTACTO";
    } else if (resendDisponible()) {
      const from = `${gestoria} <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: destino, subject: aviso.evento, html: emailHtml(gestoria, cuerpo, portalUrl), text: cuerpo,
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[aviso email]", error.message ?? error);
    } else {
      estado = "SIMULADO";
    }

    console.log(`[aviso ${estado}] email → ${destino || "(sin email)"} | ${aviso.evento} | ${cuerpo}`);

    const sufijo =
      estado === "ENVIADO" ? "" :
      estado === "SIMULADO" ? " (simulado)" :
      estado === "SIN_CONTACTO" ? " — sin email del cliente" : " — error de envío";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `📧 Aviso al cliente${sufijo}: ${aviso.evento}`,
    });
  } catch (e) {
    // Un aviso ne doit JAMAIS casser le flux appelant.
    console.error("[dispararAviso]", e instanceof Error ? e.message : e);
  }
}

// Notification de fin de parcours : envoie au client (email + WhatsApp) un lien de
// SUIVI (/s/[token]) dans SA langue (Cliente.idioma). Idempotente par expediente
// (ne renvoie pas si déjà envoyée). Ne casse jamais le flux appelant.
export async function enviarSeguimiento(
  admin: SupabaseClient,
  opts: { expedienteId: string; baseUrl?: string },
): Promise<void> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("portalToken, Cliente(nombre, email, telefono, idioma), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as (ExpRow & { Cliente: ({ idioma?: string | null } & ExpRow["Cliente"]) }) | null;
    if (!exp?.portalToken) return;

    // Idempotence : ne pas renvoyer si la notif de suivi a déjà été journalisée.
    const { data: yaEnviado } = await admin
      .from("ExpedienteEvento")
      .select("id")
      .eq("expedienteId", opts.expedienteId)
      .eq("tipo", "NOTIFICACION_ENVIADA")
      .ilike("descripcion", "%seguimiento%")
      .limit(1)
      .maybeSingle();
    if (yaEnviado) return;

    const cliente = uno(exp.Cliente ?? null) as { nombre: string | null; email: string | null; telefono: string | null; idioma?: string | null } | null;
    const gestoria = uno(exp.Workspace ?? null)?.nombre ?? "Tu gestoría";
    const lang = (["es", "en", "fr", "it", "de"].includes(cliente?.idioma ?? "") ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    const subject = t("notif.seg.subject", { gestoria });
    const cuerpo = t("notif.seg.body", { nombre });
    const boton = t("notif.seg.boton");

    let estado: Estado = "SIMULADO";
    let destino = cliente?.email ?? "";
    if (!destino) {
      estado = "SIN_CONTACTO";
    } else if (resendDisponible() && link) {
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <p style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 16px">${gestoria}</p>
  <p style="font-size:15px;line-height:1.6;margin:0">${cuerpo}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#0E8C5F;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block">${boton}</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">
  <p style="font-size:12px;color:#94a3b8;margin:0">${gestoria} · Aproba</p>
</div>`;
      const from = `${gestoria} <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: destino, subject, html, text: `${cuerpo} ${link}` });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[seguimiento email]", error.message ?? error);
    }

    console.log(`[seguimiento ${estado}] email → ${destino || "(sin contacto)"} | ${link ?? ""}`);
    // WhatsApp (simulé) — l'auto réelle = WhatsApp Business API (chantier).
    const tel = cliente?.telefono ?? "";
    console.log(`[seguimiento whatsapp ${tel ? "SIMULADO" : "SIN_CONTACTO"}] → ${tel || "(sin teléfono)"} | ${link ?? ""}`);

    const sufijo = estado === "ENVIADO" ? "" : estado === "SIN_CONTACTO" ? " — sin contacto" : estado === "ERROR" ? " — error" : " (simulado)";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `📍 Enlace de seguimiento enviado al cliente${sufijo}`,
    });
  } catch (e) {
    console.error("[enviarSeguimiento]", e instanceof Error ? e.message : e);
  }
}
