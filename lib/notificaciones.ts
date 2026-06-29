import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeT, type Lang } from "@/lib/portal-i18n";
import { DEFAULT_AVISOS } from "@/lib/avisos";
import { fetchStripeKeyDeWorkspace } from "@/lib/cobros-tarjeta";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_A_SERVICIO, docsFaltantes } from "@/lib/tramites";

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

const inicialesDe = (s: string) =>
  ((s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2)) || "?";

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Layout email partagé : soigné, white-label (marque = la gestoría ; « α aproba »
// discret en pied) et compatible (table-based, styles inline) pour Gmail/Outlook/Apple.
function emailLayout(opts: {
  gestoria: string;
  titulo: string;
  cuerpoHtml: string;
  cta?: { url: string; label: string } | null;
  footerNota?: string;
  preheader?: string;
}): string {
  const { gestoria, titulo, cuerpoHtml, cta, footerNota, preheader } = opts;
  const ini = inicialesDe(gestoria);
  const boton = cta
    ? `<tr><td align="center" style="padding-top:24px;text-align:center"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${cta.url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${cta.label}</a></td></tr></table></td></tr>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f6f4;-webkit-font-smoothing:antialiased">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f4"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e6eae8;border-radius:16px;overflow:hidden">
    <tr><td height="4" style="height:4px;background:#0E8C5F;line-height:4px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:22px 30px 18px;border-bottom:1px solid #eef1f0">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="42" height="42" align="center" valign="middle" bgcolor="#ECFDF5" style="width:42px;height:42px;border-radius:11px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#0D6E4D">${ini}</td>
        <td style="width:12px">&nbsp;</td>
        <td valign="middle" style="font-family:${FUENTE};font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.01em">${gestoria}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 30px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:${FUENTE};font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;padding-bottom:12px">${titulo}</td></tr>
      <tr><td style="font-family:${FUENTE};font-size:15px;line-height:1.65;color:#475569">${cuerpoHtml}</td></tr>
      ${boton}
    </table></td></tr>
    <tr><td style="padding:18px 30px;border-top:1px solid #eef1f0;background:#fafbfb">
      <p style="margin:0;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#94a3b8">${footerNota ?? `Mensaje de ${gestoria}.`}</p>
      <p style="margin:7px 0 0;font-family:${FUENTE};font-size:11px;color:#cbd5e1">Con la tecnología de <span style="color:#0E8C5F;font-weight:700">α</span> <span style="color:#64748b;font-weight:600">aproba</span></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
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
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: destino, subject: aviso.evento,
        html: emailLayout({
          gestoria, titulo: aviso.evento, cuerpoHtml: `<p style="margin:0">${cuerpo.replace(/\n/g, "<br>")}</p>`,
          cta: portalUrl ? { url: portalUrl, label: "Ver mi expediente" } : null,
          footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
          preheader: cuerpo,
        }),
        text: cuerpo,
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
      .select("portalToken, tipo, servicioClave, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as {
      portalToken: string | null;
      tipo: string;
      servicioClave: string | null;
      Cliente: { nombre: string | null; email: string | null; telefono: string | null; idioma?: string | null } | { nombre: string | null; email: string | null; telefono: string | null; idioma?: string | null }[] | null;
      Workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
      documentos: { tipo: string; estado: string }[] | null;
    } | null;
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
    const ws = uno(exp.Workspace ?? null);
    const gestoria = ws?.nombre ?? "Tu gestoría";
    const lang = (["es", "en", "fr", "it", "de"].includes(cliente?.idioma ?? "") ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    // ¿Faltan documentos por enviar? Misma lógica que la página de seguimiento /s/[token]:
    // un requerido cuenta como pendiente salvo que esté VALIDADO o PROCESANDO (subido).
    let faltanDocs = false;
    try {
      if (ws?.id) {
        const servicios = await fetchServiciosDeWorkspace(admin, ws.id);
        const servicio = servicios.find((s) => s.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
        faltanDocs = docsFaltantes(servicio?.docs ?? [], exp.documentos ?? []).length > 0;
      }
    } catch { /* repli propre : sin info de docs, email de seguimiento normal */ }

    const subject = t("notif.seg.subject", { gestoria });
    const titulo = faltanDocs ? t("notif.seg.tituloFaltan") : t("notif.seg.titulo");
    const cuerpo = faltanDocs ? t("notif.seg.bodyFaltan", { nombre }) : t("notif.seg.body", { nombre });
    const boton = faltanDocs ? t("notif.seg.botonSubir") : t("notif.seg.boton");

    let estado: Estado = "SIMULADO";
    let destino = cliente?.email ?? "";
    if (!destino) {
      estado = "SIN_CONTACTO";
    } else if (resendDisponible() && link) {
      const html = emailLayout({
        gestoria,
        titulo,
        cuerpoHtml: `<p style="margin:0">${cuerpo}</p>`,
        cta: { url: link, label: boton },
        preheader: cuerpo,
      });
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
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

// Demande de paiement par VIREMENT : envoie au client un email avec le montant, le
// concept, le nº de facture et les coordonnées bancaires (IBAN) du despacho — pas de
// carte, pas de débit automatique. Ne casse jamais le flux appelant.
const fmtEur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export async function enviarSolicitudPago(
  admin: SupabaseClient,
  opts: { expedienteId: string; facturaId?: string; numero: string; total: number; concepto: string; baseUrl?: string },
): Promise<void> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("workspaceId, portalToken, Cliente(nombre, email), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { workspaceId: string; portalToken: string | null; Cliente: { nombre: string | null; email: string | null } | { nombre: string | null; email: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return;
    const cliente = uno(exp.Cliente);
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(cliente?.nombre ?? "cliente");

    // Compte bancaire actif du despacho (pour le virement).
    const { data: cuentas } = await admin.from("CuentaBancaria").select("titular, iban, banco").eq("workspaceId", exp.workspaceId).eq("activa", true).limit(1);
    const cuenta = (cuentas ?? [])[0] as { titular?: string | null; iban?: string | null; banco?: string | null } | undefined;

    const bancoBox = cuenta?.iban
      ? `<p style="margin:0 0 8px;font-family:${FUENTE};font-size:14px;color:#475569">Puedes pagar por <strong>transferencia bancaria</strong> a esta cuenta:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${FUENTE};font-size:14px;color:#1e293b">
          ${cuenta.titular ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b">Titular</td><td style="font-weight:600">${cuenta.titular}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#64748b">IBAN</td><td style="font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;letter-spacing:0.02em">${cuenta.iban}</td></tr>
          ${cuenta.banco ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b">Banco</td><td style="font-weight:600">${cuenta.banco}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#64748b">Concepto</td><td style="font-weight:600">${opts.numero}</td></tr>
        </table>`
      : `<p style="margin:0;font-family:${FUENTE};font-size:14px;color:#64748b">Tu gestoría te facilitará los datos para realizar el pago.</p>`;

    // Cobro con tarjeta: activo solo si la gestoría configuró su clave Stripe (opt-in).
    const tarjetaOn = Boolean(opts.facturaId) && Boolean(opts.baseUrl) && Boolean(await fetchStripeKeyDeWorkspace(admin, exp.workspaceId));
    const fraseFinal = "En cuanto recibamos el pago, te lo confirmaremos. ¡Gracias!";
    const indicaLine = tarjetaOn
      ? `Si pagas por transferencia, indica el número de factura (<strong>${opts.numero}</strong>) en el concepto. También puedes pagarla con tarjeta:`
      : `Indica el número de factura (<strong>${opts.numero}</strong>) en el concepto. ${fraseFinal}`;
    const botonTarjeta = tarjetaOn
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="text-align:center;padding-top:18px"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${opts.baseUrl}/api/pagos/checkout?f=${opts.facturaId}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Pagar ${fmtEur(opts.total)} con tarjeta</a></td></tr></table></td></tr></table>
      <p style="margin:16px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b;line-height:1.6;text-align:center">${fraseFinal}</p>`
      : "";

    const cuerpoHtml = `<p style="margin:0 0 2px">Hola ${nombre},</p>
      <p style="margin:0">aquí tienes tu factura <strong>${opts.numero}</strong>. Puedes abonarla por ${tarjetaOn ? "transferencia o tarjeta" : "transferencia"}.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td align="center" style="background:#ECFDF5;border:1px solid #C7EFDD;border-radius:12px;padding:18px;text-align:center">
        <p style="margin:0;font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0D6E4D">Importe a pagar · IVA incluido</p>
        <p style="margin:5px 0 0;font-family:${FUENTE};font-size:27px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1">${fmtEur(opts.total)}</p>
        <p style="margin:5px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b">${opts.concepto}</p>
      </td></tr></table>
      ${bancoBox}
      <p style="margin:16px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b;line-height:1.6">${indicaLine}</p>
      ${botonTarjeta}`;

    const html = emailLayout({
      gestoria,
      titulo: "Tu factura está lista",
      cuerpoHtml,
      // Con tarjeta: el botón va dentro del cuerpo (para poner la frase final debajo).
      // Sin tarjeta: se mantiene el botón «Ver mi expediente» del layout.
      cta: tarjetaOn ? null : (exp.portalToken && opts.baseUrl ? { url: `${opts.baseUrl}/s/${exp.portalToken}`, label: "Ver mi expediente" } : null),
      footerNota: `Factura emitida por ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: `Factura ${opts.numero} · ${fmtEur(opts.total)}`,
    });

    let estado: Estado = "SIMULADO";
    const destino = cliente?.email ?? "";
    if (!destino) {
      estado = "SIN_CONTACTO";
    } else if (resendDisponible()) {
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: destino, subject: `Factura ${opts.numero} · ${fmtEur(opts.total)}`, html, text: `Factura ${opts.numero}: ${fmtEur(opts.total)}. ${cuenta?.iban ? `IBAN: ${cuenta.iban}` : ""}`,
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[solicitudPago email]", error.message ?? error);
    }

    console.log(`[solicitudPago ${estado}] email → ${destino || "(sin email)"} | factura ${opts.numero} | ${fmtEur(opts.total)}`);
    const sufijo = estado === "ENVIADO" ? "" : estado === "SIN_CONTACTO" ? " — sin email del cliente" : estado === "ERROR" ? " — error" : " (simulado)";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `💳 Solicitud de pago enviada al cliente (factura ${opts.numero}, ${fmtEur(opts.total)})${sufijo}`,
    });
  } catch (e) {
    console.error("[enviarSolicitudPago]", e instanceof Error ? e.message : e);
  }
}

// Confirmación de pago RECIBIDO (tarjeta o transferencia) → email al cliente SIN IBAN
// (ya está pagada): solo agradecimiento + enlace de seguimiento. Se envía cuando una
// factura pasa a PAGADA. No casser el flux appelant.
export async function enviarConfirmacionPago(
  admin: SupabaseClient,
  opts: { expedienteId: string; numero: string; total: number; metodo?: "TARJETA" | "TRANSFERENCIA" | "EFECTIVO"; baseUrl?: string },
): Promise<void> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("portalToken, Cliente(nombre, email), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { portalToken: string | null; Cliente: { nombre: string | null; email: string | null } | { nombre: string | null; email: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return;
    const cliente = uno(exp.Cliente);
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const via = opts.metodo === "TARJETA" ? "con tarjeta" : opts.metodo === "EFECTIVO" ? "en efectivo" : "por transferencia";
    const link = exp.portalToken && opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    const cuerpoHtml = `<p style="margin:0 0 2px">Hola ${nombre},</p>
      <p style="margin:0">hemos recibido tu pago ${via} de la factura <strong>${opts.numero}</strong> (${fmtEur(opts.total)}). ¡Gracias! Seguimos avanzando con tu trámite.</p>`;
    const html = emailLayout({
      gestoria,
      titulo: "Pago recibido ✓",
      cuerpoHtml,
      cta: link ? { url: link, label: "Ver mi expediente" } : null,
      footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: `Pago recibido · factura ${opts.numero} · ${fmtEur(opts.total)}`,
    });

    let estado: Estado = "SIMULADO";
    const destino = cliente?.email ?? "";
    if (!destino) {
      estado = "SIN_CONTACTO";
    } else if (resendDisponible()) {
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: destino, subject: `Pago recibido · factura ${opts.numero}`, html, text: `Hemos recibido tu pago ${via} de la factura ${opts.numero} (${fmtEur(opts.total)}). ¡Gracias!`,
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[confirmacionPago email]", error.message ?? error);
    }

    console.log(`[confirmacionPago ${estado}] email → ${destino || "(sin email)"} | factura ${opts.numero} | ${via}`);
    const sufijo = estado === "ENVIADO" ? "" : estado === "SIN_CONTACTO" ? " — sin email del cliente" : estado === "ERROR" ? " — error" : " (simulado)";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `📧 Confirmación de pago enviada al cliente (factura ${opts.numero})${sufijo}`,
    });
  } catch (e) {
    console.error("[enviarConfirmacionPago]", e instanceof Error ? e.message : e);
  }
}

// Recordatorio MANUAL (el gestor pulsa «Recordar al cliente»): email al cliente con la
// LISTA de documentos que faltan + botón para subirlos. NO idempotente (se puede reenviar).
// Devuelve el resultado para que la ruta informe al gestor.
export async function enviarRecordatorioDocs(
  admin: SupabaseClient,
  opts: { expedienteId: string; baseUrl?: string },
): Promise<{ enviado: boolean; faltan: number; motivo?: "sin_faltan" | "sin_email" | "simulado" | "error" }> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("portalToken, tipo, servicioClave, Cliente(nombre, email, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as {
      portalToken: string | null;
      tipo: string;
      servicioClave: string | null;
      Cliente: { nombre: string | null; email: string | null; idioma?: string | null } | { nombre: string | null; email: string | null; idioma?: string | null }[] | null;
      Workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
      documentos: { tipo: string; estado: string }[] | null;
    } | null;
    if (!exp) return { enviado: false, faltan: 0, motivo: "error" };
    const cliente = uno(exp.Cliente);
    const ws = uno(exp.Workspace);
    const gestoria = ws?.nombre ?? "Tu gestoría";
    const lang = (["es", "en", "fr", "it", "de"].includes(cliente?.idioma ?? "") ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = exp.portalToken && opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    let faltantes: string[] = [];
    if (ws?.id) {
      const servicios = await fetchServiciosDeWorkspace(admin, ws.id);
      const servicio = servicios.find((s) => s.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
      faltantes = docsFaltantes(servicio?.docs ?? [], exp.documentos ?? []);
    }
    if (!faltantes.length) return { enviado: false, faltan: 0, motivo: "sin_faltan" };
    const destino = cliente?.email ?? "";
    if (!destino) return { enviado: false, faltan: faltantes.length, motivo: "sin_email" };

    const lista = faltantes.map((d) => `<li style="margin:3px 0">${d}</li>`).join("");
    const cuerpoHtml = `<p style="margin:0 0 10px">${t("notif.recDocs.intro", { nombre })}</p>
      <ul style="margin:0;padding-left:20px;font-family:${FUENTE};font-size:15px;color:#1e293b">${lista}</ul>
      <p style="margin:14px 0 0">${t("notif.recDocs.outro")}</p>`;
    const html = emailLayout({
      gestoria,
      titulo: t("notif.recDocs.titulo"),
      cuerpoHtml,
      cta: link ? { url: link, label: t("notif.seg.botonSubir") } : null,
      footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: t("notif.recDocs.titulo"),
    });

    let estado: Estado = "SIMULADO";
    if (resendDisponible() && link) {
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: destino, subject: t("notif.recDocs.subject", { gestoria }), html,
        text: `${t("notif.recDocs.intro", { nombre })} ${faltantes.join(", ")}. ${link ?? ""}`,
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[recordatorioDocs email]", error.message ?? error);
    }

    const sufijo = estado === "ENVIADO" ? "" : estado === "ERROR" ? " — error" : " (simulado)";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `📧 Recordatorio de documentos enviado al cliente (${faltantes.length})${sufijo}`,
    });
    if (estado === "ERROR") return { enviado: false, faltan: faltantes.length, motivo: "error" };
    return { enviado: estado === "ENVIADO", faltan: faltantes.length, motivo: estado === "SIMULADO" ? "simulado" : undefined };
  } catch (e) {
    console.error("[enviarRecordatorioDocs]", e instanceof Error ? e.message : e);
    return { enviado: false, faltan: 0, motivo: "error" };
  }
}
