import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeT, type Lang, esLangSoportada } from "@/lib/portal-i18n";
import { DEFAULT_AVISOS } from "@/lib/avisos";
import { fetchStripeKeyDeWorkspace } from "@/lib/cobros-tarjeta";
import { enviarWhatsApp, fetchCanalAvisos, telefonoE164, whatsappDisponible, canalesEfectivos, type CanalAvisos } from "@/lib/whatsapp";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { docsFaltantes } from "@/lib/tramites";
import { serviciosDeExpediente, docsDeExpediente } from "@/lib/multi-servicio";

// Avisos automáticos au client — email (Resend) et/ou WhatsApp (Twilio) selon le canal
// choisi par le workspace (Ajustes → Notificaciones al cliente : EMAIL | WHATSAPP | AMBOS).
// Conçu en « repli propre » : sans RESEND_API_KEY / credentials Twilio, le message est
// rendu et JOURNALISÉ (estado SIMULADO) au lieu d'être envoyé — l'app fonctionne
// identiquement. Chaque aviso laisse une trace dans le historial de l'expediente
// (NOTIFICACION_ENVIADA), et rien ici ne doit jamais faire échouer le flux appelant.

export const resendDisponible = () => Boolean(process.env.RESEND_API_KEY);

type Estado = "ENVIADO" | "SIMULADO" | "SIN_CONTACTO" | "ERROR";

// ── Canal del workspace: qué canales intentar y cómo journaliser el resultado ──
// Repli si WhatsApp no está disponible en la plataforma: ver canalesEfectivos (lib/whatsapp).
const quiereCanales = (canal: CanalAvisos) => canalesEfectivos(canal, whatsappDisponible());

// Estado global de un envío multi-canal (para los retornos {enviado, motivo} al gestor):
// basta con que UN canal haya salido para considerarlo enviado. ERROR pesa más que
// SIMULADO: si ningún canal entregó de verdad y uno falló, el gestor debe verlo.
function estadoGlobal(estados: (Estado | null)[]): Estado {
  const es = estados.filter((e): e is Estado => e !== null);
  if (es.includes("ENVIADO")) return "ENVIADO";
  if (es.includes("ERROR")) return "ERROR";
  if (es.includes("SIMULADO")) return "SIMULADO";
  return "SIN_CONTACTO";
}

// Motivo preciso cuando NINGÚN canal tenía contacto utilizable: el mensaje al gestor
// debe apuntar al campo correcto según el canal elegido (email, móvil o ambos).
const motivoSinContacto = (estadoEmail: Estado | null, estadoWa: Estado | null) =>
  estadoWa === null ? ("sin_email" as const) : estadoEmail === null ? ("sin_telefono" as const) : ("sin_contacto" as const);

const etiquetaEstado = (e: Estado) =>
  e === "ENVIADO" ? "enviado" : e === "SIMULADO" ? "simulado" : e === "SIN_CONTACTO" ? "sin contacto" : "error";

// Icono + sufijo del evento del historial según los canales intentados. En email-only
// el formato coincide con el histórico de dispararAviso (las demás funciones tenían
// variantes «— sin contacto»/«— error», unificadas aquí; nada matchea esos sufijos —
// la única búsqueda por descripción es ilike '%seguimiento%' y su base no cambia).
function iconoYSufijo(email: Estado | null, wa: Estado | null): { icono: string; sufijo: string } {
  if (email !== null && wa === null) {
    const sufijo = email === "ENVIADO" ? "" : email === "SIMULADO" ? " (simulado)" : email === "SIN_CONTACTO" ? " — sin email del cliente" : " — error de envío";
    return { icono: "📧", sufijo };
  }
  if (email === null && wa !== null) {
    const sufijo = wa === "ENVIADO" ? "" : wa === "SIMULADO" ? " (simulado)" : wa === "SIN_CONTACTO" ? " — sin teléfono del cliente" : " — error de envío";
    return { icono: "📱", sufijo };
  }
  const ambosOk = email === "ENVIADO" && wa === "ENVIADO";
  return { icono: "📧📱", sufijo: ambosOk ? "" : ` (email ${etiquetaEstado(email ?? "ERROR")} · WhatsApp ${etiquetaEstado(wa ?? "ERROR")})` };
}

// El cuerpo WhatsApp (gestoría en negrita + texto + enlace) se compone DENTRO de
// enviarWhatsApp: en modo plantilla (producción) esas partes van como variables.
const primerNombre = (n: string) => (n || "").trim().split(/\s+/)[0] || (n || "cliente");
const render = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

const inicialesDe = (s: string) =>
  ((s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2)) || "?";

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Layout email partagé : soigné, white-label (marque = la gestoría ; « α aproba »
// discret en pied), corps CENTRADO (título, texto, pie — los bloques <table> internos
// necesitan su propio align="center") et compatible (table-based, styles inline) pour
// Gmail/Outlook/Apple.
export function emailLayout(opts: {
  gestoria: string;
  titulo: string;
  cuerpoHtml: string;
  cta?: { url: string; label: string } | null;
  footerNota?: string;
  avatarUrl?: string | null; // foto del gestor a cargo; sin ella, las iniciales
  preheader?: string;
}): string {
  const { gestoria, titulo, cuerpoHtml, cta, footerNota, preheader, avatarUrl } = opts;
  const ini = inicialesDe(gestoria);
  // Foto del gestor que lleva el expediente (bucket público `avatares`), con las
  // iniciales del despacho de repli. Sin border-radius en Outlook: se verá cuadrada,
  // no rota — preferible a no enseñarla.
  const marca = avatarUrl
    ? `<td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px"><img src="${avatarUrl}" width="52" height="52" alt="" style="width:52px;height:52px;border-radius:14px;display:block;object-fit:cover;border:0" /></td>`
    : `<td width="52" height="52" align="center" valign="middle" bgcolor="#ECFDF5" style="width:52px;height:52px;border-radius:14px;font-family:${FUENTE};font-size:18px;font-weight:700;color:#0D6E4D">${ini}</td>`;
  const boton = cta
    ? `<tr><td align="center" style="padding-top:24px;text-align:center"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${cta.url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${cta.label}</a></td></tr></table></td></tr>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f6f4;-webkit-font-smoothing:antialiased">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f4"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e6eae8;border-radius:16px;overflow:hidden">
    <tr><td height="4" style="height:4px;background:#0E8C5F;line-height:4px;font-size:0">&nbsp;</td></tr>
    <tr><td align="center" style="padding:22px 30px 18px;border-bottom:1px solid #eef1f0;text-align:center">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr>
        ${marca}
        <td style="width:12px">&nbsp;</td>
        <td valign="middle" style="font-family:${FUENTE};font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.01em">${gestoria}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 30px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="font-family:${FUENTE};font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;padding-bottom:12px;text-align:center">${titulo}</td></tr>
      <tr><td align="center" style="font-family:${FUENTE};font-size:15px;line-height:1.65;color:#475569;text-align:center">${cuerpoHtml}</td></tr>
      ${boton}
    </table></td></tr>
    <tr><td align="center" style="padding:18px 30px;border-top:1px solid #eef1f0;background:#fafbfb;text-align:center">
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
// MULTI-OFICINA — résolution d'une plantilla d'aviso : (1) la sede de l'expediente, en
// suivant le pointeur « usar los mismos que X » (un salto), (2) sinon les avisos de la
// gestoría (filas null), (3) sinon le défaut. Fail-soft à chaque étage. Partagée entre
// dispararAviso et les correos combinados (finalización) qui respectent la plantilla
// personnalisée du despacho sans passer par dispararAviso.
async function plantillaDeAviso(
  admin: SupabaseClient,
  opts: { workspaceId: string; expedienteId: string; clave: string },
): Promise<{ evento: string; template: string; canal: string; activo: boolean; oculto?: boolean; sedeAviso: string | null } | null> {
  let sedeAviso: string | null = null;
  if (opts.expedienteId) {
    try {
      const { data: se } = await admin.from("Expediente").select("oficinaId").eq("id", opts.expedienteId).maybeSingle();
      sedeAviso = ((se as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
      if (sedeAviso) {
        const { data: of } = await admin.from("Oficina").select("avisosComoOficinaId").eq("id", sedeAviso).maybeSingle();
        const ref = ((of as { avisosComoOficinaId?: string | null } | null)?.avisosComoOficinaId ?? null) || null;
        if (ref) sedeAviso = ref; // un seul salto, jamais de chaînes
      }
    } catch { sedeAviso = null; }
  }
  type Row = { evento: string; template: string; canal: string; activo: boolean; oculto?: boolean | null };
  // `oculto` llegó con avisos-personalizados.sql: cada select lo intenta y, si la
  // columna no existe aún, reintenta sin ella (mismo patrón que el resto de la config).
  const leer = async (filtroSede: string | null) => {
    const q = (cols: string) => {
      let b = admin.from("AvisoConfig").select(cols)
        .eq("workspaceId", opts.workspaceId).eq("clave", opts.clave);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b = filtroSede ? b.eq("oficinaId", filtroSede) : ((b as any).is("oficinaId", null));
      return b.maybeSingle();
    };
    let r = await q("evento, template, canal, activo, oculto");
    if (r.error) r = (await q("evento, template, canal, activo")) as unknown as typeof r;
    return (r.data as Row | null) ?? null;
  };
  let row: Row | null = null;
  if (sedeAviso) {
    try { row = await leer(sedeAviso); } catch { row = null; }
  }
  if (!row) {
    try { row = await leer(null); } catch { row = null; }
    if (!row) {
      // migración config-por-oficina ausente: sin filtro de sede
      let base = await admin.from("AvisoConfig")
        .select("evento, template, canal, activo")
        .eq("workspaceId", opts.workspaceId).eq("clave", opts.clave)
        .maybeSingle();
      row = (base.data as Row | null) ?? null;
    }
  }
  // Repli sur le défaut si le workspace n'a pas (encore) personnalisé cet aviso →
  // les avisos fonctionnent out-of-the-box, sans config manuelle préalable.
  const def = DEFAULT_AVISOS.find((a) => a.id === opts.clave);
  const res = row ?? (def ? { evento: def.evento, template: def.template, canal: def.canal, activo: def.activo } : null);
  return res ? { ...res, oculto: res.oculto === true, sedeAviso } : null;
}

// Avisos PERSONALIZADOS colgados de un evento real (pedido de Sandra/LexPats, 31/08).
// Ámbito: si la sede tiene avisos propios, los suyos; si no, los de la gestoría —
// misma cascada de bloque entero que el resto de la config (nunca fusión).
// Pre-migración (columna eventoBase ausente): cualquier error → lista vacía.
async function customsDeAviso(
  admin: SupabaseClient,
  opts: { workspaceId: string; clave: string; sedeAviso: string | null },
): Promise<{ evento: string; template: string }[]> {
  const listar = async (filtroSede: string | null) => {
    let b = admin.from("AvisoConfig")
      .select("evento, template, activo, oculto, orden")
      .eq("workspaceId", opts.workspaceId).eq("eventoBase", opts.clave);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b = filtroSede ? b.eq("oficinaId", filtroSede) : ((b as any).is("oficinaId", null));
    const { data, error } = await b.order("orden");
    if (error) throw new Error(error.message);
    return (data ?? []) as { evento: string; template: string; activo: boolean; oculto?: boolean | null; orden: number }[];
  };
  try {
    let filas: Awaited<ReturnType<typeof listar>> = [];
    if (opts.sedeAviso) {
      // ¿tiene la sede config propia? (cualquier fila suya) → sus customs y solo los suyos
      const { count } = await admin.from("AvisoConfig")
        .select("id", { count: "exact", head: true })
        .eq("workspaceId", opts.workspaceId).eq("oficinaId", opts.sedeAviso);
      filas = (count ?? 0) > 0 ? await listar(opts.sedeAviso) : await listar(null);
    } else {
      filas = await listar(null);
    }
    return filas.filter((f) => f.activo && f.oculto !== true).map((f) => ({ evento: f.evento, template: f.template }));
  } catch {
    return []; // migración ausente o fallo puntual: los predeterminados no se ven afectados
  }
}

export async function dispararAviso(
  admin: SupabaseClient,
  opts: { workspaceId: string; expedienteId: string; clave: string; vars?: Record<string, string>; baseUrl?: string },
): Promise<void> {
  try {
    const aviso = await plantillaDeAviso(admin, opts);
    // Mensajes a enviar: el predeterminado (si está activo y no «eliminado») + los
    // personalizados colgados del mismo evento (pedido de Sandra/LexPats, 31/08).
    const mensajes: { evento: string; template: string }[] = [];
    if (aviso && aviso.activo && !aviso.oculto) mensajes.push({ evento: aviso.evento, template: aviso.template });
    const customs = await customsDeAviso(admin, { workspaceId: opts.workspaceId, clave: opts.clave, sedeAviso: aviso?.sedeAviso ?? null });
    mensajes.push(...customs);
    if (!mensajes.length) return; // nada activo para este evento

    const { data: expRaw } = await admin
      .from("Expediente")
      .select("referencia, portalToken, Cliente(nombre, email, telefono), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as ExpRow | null;
    const cliente = uno(exp?.Cliente ?? null);
    const gestoria = uno(exp?.Workspace ?? null)?.nombre ?? "Tu gestoría";
    const nombre = cliente?.nombre ?? "cliente";
    const portalUrl = exp?.portalToken && opts.baseUrl ? `${opts.baseUrl}/j/${exp.portalToken}` : null;

    // Canal del workspace (Ajustes): EMAIL | WHATSAPP | AMBOS.
    const canal = quiereCanales(await fetchCanalAvisos(admin, opts.workspaceId));
    const foto = await fotoDelExpediente(admin, opts.expedienteId);

    for (const mensaje of mensajes) {
    const cuerpo = render(mensaje.template, { nombre: primerNombre(nombre), ...(opts.vars ?? {}) });

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible()) {
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from, to: destino, subject: mensaje.evento,
          html: emailLayout({
            avatarUrl: foto,
            gestoria, titulo: mensaje.evento, cuerpoHtml: `<p style="margin:0">${cuerpo.replace(/\n/g, "<br>")}</p>`,
            cta: portalUrl ? { url: portalUrl, label: "Ver mi expediente" } : null,
            footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
            preheader: cuerpo,
          }),
          text: cuerpo,
        });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[aviso email]", error.message ?? error);
      }
      console.log(`[aviso ${estadoEmail}] email → ${cliente?.email || "(sin email)"} | ${mensaje.evento} | ${cuerpo}`);
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      estadoWa = await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo, link: portalUrl });
      console.log(`[aviso ${estadoWa}] whatsapp → ${cliente?.telefono || "(sin teléfono)"} | ${mensaje.evento}`);
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    const { icono, sufijo } = iconoYSufijo(estadoEmail, estadoWa);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `${icono} Aviso al cliente${sufijo}: ${mensaje.evento}`,
    });
    } // fin del bucle de mensajes
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
    let resExp = await admin
      .from("Expediente")
      .select("portalToken, tipo, servicioClave, serviciosExtra, docsExtra, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    if (resExp.error) resExp = await admin
      .from("Expediente")
      .select("portalToken, tipo, servicioClave, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle() as typeof resExp;
    const expRaw = resExp.data;
    const exp = expRaw as {
      portalToken: string | null;
      tipo: string;
      servicioClave: string | null;
      serviciosExtra?: string[] | null;
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
    const lang = (esLangSoportada(cliente?.idioma) ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    // ¿Faltan documentos por enviar? Misma lógica que la página de seguimiento /s/[token]:
    // un requerido cuenta como pendiente salvo que esté VALIDADO o PROCESANDO (subido).
    let faltanDocs = false;
    try {
      if (ws?.id) {
        const sedeNtf = await (async () => {
        try {
          const { data: se } = await admin.from("Expediente").select("oficinaId").eq("id", opts.expedienteId).maybeSingle();
          return ((se as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
        } catch { return null; }
      })();
      const servicios = await fetchServiciosDeWorkspace(admin, ws.id, sedeNtf);
        const requeridos = docsDeExpediente(serviciosDeExpediente(exp, servicios), (exp as { docsExtra?: unknown }).docsExtra);
        faltanDocs = docsFaltantes(requeridos, exp.documentos ?? []).length > 0;
      }
    } catch { /* repli propre : sin info de docs, email de seguimiento normal */ }

    const subject = t("notif.seg.subject", { gestoria });
    const titulo = faltanDocs ? t("notif.seg.tituloFaltan") : t("notif.seg.titulo");
    const cuerpo = faltanDocs ? t("notif.seg.bodyFaltan", { nombre }) : t("notif.seg.body", { nombre });
    const boton = faltanDocs ? t("notif.seg.botonSubir") : t("notif.seg.boton");

    const canal = quiereCanales(ws?.id ? await fetchCanalAvisos(admin, ws.id) : "EMAIL");

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible() && link) {
        const html = emailLayout({
          avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
          gestoria,
          titulo,
          cuerpoHtml: `<p style="margin:0">${cuerpo}</p>`,
          cta: { url: link, label: boton },
          preheader: cuerpo,
        });
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: destino, subject, html, text: `${cuerpo} ${link}` });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[seguimiento email]", error.message ?? error);
      }
      console.log(`[seguimiento ${estadoEmail}] email → ${cliente?.email || "(sin contacto)"} | ${link ?? ""}`);
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      estadoWa = telefonoE164(cliente?.telefono) === null ? "SIN_CONTACTO"
        : link ? await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo, link }) : "SIMULADO";
      console.log(`[seguimiento ${estadoWa}] whatsapp → ${cliente?.telefono || "(sin teléfono)"} | ${link ?? ""}`);
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    const { sufijo } = iconoYSufijo(estadoEmail, estadoWa);
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

// Foto del gestor que lleva el expediente (Expediente.asignadoAId → User.avatarUrl).
// Best-effort: si la columna no existe, el usuario no tiene foto o falla la consulta,
// se devuelve null y el email enseña las iniciales del despacho, como siempre.
export async function fotoDeUsuario(admin: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await admin.from("User").select("avatarUrl").eq("id", userId).maybeSingle();
    return (data as { avatarUrl?: string | null } | null)?.avatarUrl ?? null;
  } catch { return null; }
}

// Foto del OWNER del despacho: la que lleva la cabecera de los emails dirigidos AL
// GESTOR (aviso de trámite pedido desde el espacio, digest de vencimientos).
export async function fotoDelOwner(admin: SupabaseClient, workspaceId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("Membership").select("userId").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
    return await fotoDeUsuario(admin, (data as { userId?: string | null } | null)?.userId);
  } catch { return null; }
}

export async function fotoDelExpediente(admin: SupabaseClient, expedienteId: string): Promise<string | null> {
  try {
    const { data: exp } = await admin.from("Expediente").select("asignadoAId").eq("id", expedienteId).maybeSingle();
    return await fotoDeUsuario(admin, (exp as { asignadoAId?: string | null } | null)?.asignadoAId);
  } catch { return null; }
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
      .select("workspaceId, oficinaId, portalToken, Cliente(nombre, email, telefono), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { workspaceId: string; oficinaId?: string | null; portalToken: string | null; Cliente: { nombre: string | null; email: string | null; telefono: string | null } | { nombre: string | null; email: string | null; telefono: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return;
    const cliente = uno(exp.Cliente);
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(cliente?.nombre ?? "cliente");

    // Cuenta activa DE LA SEDE del expediente (cascada a la común): el cliente de
    // Diagonal debe transferir a la cuenta de Diagonal, no a la de Gran Via.
    const { cuentaParaOficina } = await import("./facturacion-oficina");
    const cuenta = await cuentaParaOficina(admin, exp.workspaceId, exp.oficinaId ?? null) ?? undefined;

    const bancoBox = cuenta?.iban
      ? `<p style="margin:0 0 8px;font-family:${FUENTE};font-size:14px;color:#475569">Puedes pagar por <strong>transferencia bancaria</strong> a esta cuenta:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;font-family:${FUENTE};font-size:14px;color:#1e293b">
          ${cuenta.titular ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Titular</td><td style="font-weight:600;text-align:left">${cuenta.titular}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">IBAN</td><td style="font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;letter-spacing:0.02em;text-align:left">${cuenta.iban}</td></tr>
          ${cuenta.banco ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Banco</td><td style="font-weight:600;text-align:left">${cuenta.banco}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Concepto</td><td style="font-weight:600;text-align:left">${opts.numero}</td></tr>
        </table>`
      : `<p style="margin:0;font-family:${FUENTE};font-size:14px;color:#64748b">Tu gestoría te facilitará los datos para realizar el pago.</p>`;

    // Cobro con tarjeta: activo solo si la gestoría configuró su clave Stripe (opt-in).
    const tarjetaOn = Boolean(opts.facturaId) && Boolean(opts.baseUrl) && Boolean(await fetchStripeKeyDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null));
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
      avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
      gestoria,
      titulo: "Tu factura está lista",
      cuerpoHtml,
      // Con tarjeta: el botón va dentro del cuerpo (para poner la frase final debajo).
      // Sin tarjeta: se mantiene el botón «Ver mi expediente» del layout.
      cta: tarjetaOn ? null : (exp.portalToken && opts.baseUrl ? { url: `${opts.baseUrl}/s/${exp.portalToken}`, label: "Ver mi expediente" } : null),
      footerNota: `Factura emitida por ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: `Factura ${opts.numero} · ${fmtEur(opts.total)}`,
    });

    const canal = quiereCanales(await fetchCanalAvisos(admin, exp.workspaceId));

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible()) {
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from, to: destino, subject: `Factura ${opts.numero} · ${fmtEur(opts.total)}`, html, text: `Factura ${opts.numero}: ${fmtEur(opts.total)}. ${cuenta?.iban ? `IBAN: ${cuenta.iban}` : ""}`,
        });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[solicitudPago email]", error.message ?? error);
      }
      console.log(`[solicitudPago ${estadoEmail}] email → ${cliente?.email || "(sin email)"} | factura ${opts.numero} | ${fmtEur(opts.total)}`);
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      const lineas = [
        `Hola ${nombre}, tu factura ${opts.numero} está lista: ${fmtEur(opts.total)} (${opts.concepto}).`,
        cuenta?.iban
          ? `Transferencia: ${cuenta.iban}${cuenta.banco ? ` (${cuenta.banco})` : ""} — indica ${opts.numero} en el concepto.`
          : "Tu gestoría te facilitará los datos para realizar el pago.",
        ...(tarjetaOn ? [`Pagar con tarjeta: ${opts.baseUrl}/api/pagos/checkout?f=${opts.facturaId}`] : []),
      ].join("\n");
      estadoWa = await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo: lineas });
      console.log(`[solicitudPago ${estadoWa}] whatsapp → ${cliente?.telefono || "(sin teléfono)"} | factura ${opts.numero}`);
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    const { sufijo } = iconoYSufijo(estadoEmail, estadoWa);
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

// A DÓNDE responde el cliente. El remitente de los avisos es una dirección de la
// plataforma (AVISOS_EMAIL_FROM), así que sin reply-to una respuesta se pierde — de ahí
// el viejo «no respondas a este correo». En los correos donde SÍ esperamos respuesta
// (encargo con documentos para firmar, finalización) se enruta al buzón del despacho:
// el de facturación si lo configuró, si no el del propietario de la cuenta.
async function emailDeRespuesta(admin: SupabaseClient, workspaceId: string): Promise<string | null> {
  try {
    const { data: ws } = await admin.from("Workspace").select("emailFacturacion").eq("id", workspaceId).maybeSingle();
    const fact = ((ws as { emailFacturacion?: string | null } | null)?.emailFacturacion ?? "").trim();
    if (fact) return fact;
  } catch { /* columna sin migrar → owner */ }
  try {
    const { data: mem } = await admin.from("Membership").select("User(email)").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
    const u = uno((mem as { User?: { email: string | null } | { email: string | null }[] | null } | null)?.User ?? null);
    return (u?.email ?? "").trim() || null;
  } catch { return null; }
}

// Bloque de pago de los correos combinados (alta manual, finalización): importe con
// IVA, IBAN de la sede (cascada a la común) y botón de tarjeta si la gestoría lo activó.
// Mismo lenguaje visual que la solicitud de pago.
async function bloquePagoHtml(
  admin: SupabaseClient,
  opts: {
    workspaceId: string; oficinaId: string | null;
    factura: { facturaId: string; numero: string; total: number };
    baseUrl?: string;
    // Qué ES este importe («Pago inicial», «Liquidación final»…) y, debajo, el contexto
    // que evita leerlo como el precio total del trámite.
    etiqueta?: string;
    nota?: string;
  },
): Promise<string> {
  const { cuentaParaOficina } = await import("./facturacion-oficina");
  const cuenta = await cuentaParaOficina(admin, opts.workspaceId, opts.oficinaId) ?? undefined;
  const bancoBox = cuenta?.iban
    ? `<p style="margin:0 0 8px;font-family:${FUENTE};font-size:14px;color:#475569">Puedes pagarla por <strong>transferencia bancaria</strong>:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;font-family:${FUENTE};font-size:14px;color:#1e293b">
        ${cuenta.titular ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Titular</td><td style="font-weight:600;text-align:left">${cuenta.titular}</td></tr>` : ""}
        <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">IBAN</td><td style="font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;letter-spacing:0.02em;text-align:left">${cuenta.iban}</td></tr>
        ${cuenta.banco ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Banco</td><td style="font-weight:600;text-align:left">${cuenta.banco}</td></tr>` : ""}
        <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Concepto</td><td style="font-weight:600;text-align:left">${opts.factura.numero}</td></tr>
      </table>`
    : `<p style="margin:0;font-family:${FUENTE};font-size:14px;color:#64748b">Tu gestoría te facilitará los datos para realizar el pago.</p>`;
  const tarjetaOn = Boolean(opts.baseUrl) && Boolean(await fetchStripeKeyDeWorkspace(admin, opts.workspaceId, opts.oficinaId));
  const botonTarjeta = tarjetaOn
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="text-align:center;padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${opts.baseUrl}/api/pagos/checkout?f=${opts.factura.facturaId}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Pagar ${fmtEur(opts.factura.total)} con tarjeta</a></td></tr></table></td></tr></table>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td align="center" style="background:#ECFDF5;border:1px solid #C7EFDD;border-radius:12px;padding:18px;text-align:center">
    <p style="margin:0;font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0D6E4D">${opts.etiqueta ?? "Importe a pagar"} · IVA incluido</p>
    <p style="margin:5px 0 0;font-family:${FUENTE};font-size:27px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1">${fmtEur(opts.factura.total)}</p>
    <p style="margin:6px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b">Factura ${opts.factura.numero}</p>
    ${opts.nota ? `<p style="margin:4px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b">${opts.nota}</p>` : ""}
  </td></tr></table>
  ${bancoBox}
  <p style="margin:14px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b;line-height:1.6">Si pagas por transferencia, indica el número de factura (<strong>${opts.factura.numero}</strong>) en el concepto.</p>
  ${botonTarjeta}`;
}

// Email de FINALIZACIÓN (flujo «Finalizar y archivar», 22/08, pedido de Matthias): UN
// correo que cierra el trámite — y lleva dentro la liquidación final si el gestor
// decidió facturarla en el popup. Favorable/finalizado: respeta la plantilla
// «tie_entregado» del despacho (aunque esté desactivada como aviso automático: aquí el
// gestor lo pide EXPLÍCITAMENTE con el botón). Denegado: texto neutro — el «¡Enhorabuena!»
// de la plantilla sería una crueldad involuntaria.
export async function enviarFinalizacion(
  admin: SupabaseClient,
  opts: {
    expedienteId: string;
    factura?: { facturaId: string; numero: string; total: number } | null;
    baseUrl?: string;
  },
): Promise<Estado> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("workspaceId, oficinaId, referencia, estado, Cliente(nombre, email), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { workspaceId: string; oficinaId?: string | null; referencia: string; estado: string; Cliente: { nombre: string | null; email: string | null } | { nombre: string | null; email: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return "ERROR";
    const cliente = uno(exp.Cliente);
    const destino = (cliente?.email ?? "").trim();
    if (!destino) return "SIN_CONTACTO"; // sin email: el flujo sigue (se archiva igual), sin evento de envío
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(cliente?.nombre ?? "cliente");

    const denegado = exp.estado === "RECHAZADO";
    let mensaje: string;
    if (denegado) {
      mensaje = `Tu expediente <strong>${exp.referencia}</strong> ha quedado cerrado. Quedamos a tu disposición para valorar contigo los siguientes pasos.`;
    } else {
      const plantilla = await plantillaDeAviso(admin, { workspaceId: exp.workspaceId, expedienteId: opts.expedienteId, clave: "tie_entregado" });
      mensaje = (plantilla?.template ?? "¡Enhorabuena, {nombre}! Tu trámite ha quedado completado.")
        .replace(/\{nombre\}/g, nombre).replace(/\{documento\}/g, "").replace(/\{fecha\}/g, "");
    }

    const responder = await emailDeRespuesta(admin, exp.workspaceId);
    const pagoHtml = opts.factura
      ? `<p style="margin:18px 0 0;font-family:${FUENTE};font-size:14px;color:#475569;line-height:1.65">Aquí tienes la liquidación final de tu expediente:</p>
        ${await bloquePagoHtml(admin, { workspaceId: exp.workspaceId, oficinaId: exp.oficinaId ?? null, factura: opts.factura, baseUrl: opts.baseUrl, etiqueta: "Liquidación final" })}`
      : "";

    const html = emailLayout({
      avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
      gestoria,
      titulo: denegado ? "Tu expediente ha quedado cerrado" : "Tu trámite ha finalizado",
      cuerpoHtml: `<p style="margin:0 0 2px">Hola ${nombre},</p>
        <p style="margin:0">${mensaje}</p>
        ${pagoHtml}`,
      cta: null,
      // Cierre de trámite: el cliente puede tener dudas (o querer pagar) — su respuesta
      // debe llegar al despacho, no al buzón de la plataforma.
      footerNota: responder
        ? `Mensaje de ${gestoria}. Puedes responder a este correo: tu respuesta llega directamente a tu gestoría.`
        : `Mensaje de ${gestoria}.`,
      preheader: denegado ? `Expediente ${exp.referencia} cerrado` : `Trámite ${exp.referencia} finalizado${opts.factura ? ` · ${fmtEur(opts.factura.total)}` : ""}`,
    });

    let estado: Estado = "SIMULADO";
    if (resendDisponible()) {
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from,
        to: destino,
        subject: denegado ? `Expediente ${exp.referencia} · ${gestoria}` : `Tu trámite ha finalizado · ${gestoria}`,
        html,
        text: [
          `Hola ${nombre}, ${mensaje.replace(/<[^>]+>/g, "")}`,
          ...(opts.factura ? [`Liquidación final — factura ${opts.factura.numero}: ${fmtEur(opts.factura.total)}.`] : []),
        ].join("\n"),
        ...(responder ? { replyTo: responder } : {}),
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[finalizacion email]", error.message ?? error);
    }
    console.log(`[finalizacion ${estado}] email → ${destino} | ${exp.referencia}${opts.factura ? ` | factura ${opts.factura.numero}` : ""}`);

    const { sufijo } = iconoYSufijo(estado, null);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `🏁 Email de finalización enviado al cliente${opts.factura ? ` (con factura ${opts.factura.numero}, ${fmtEur(opts.factura.total)})` : " (sin factura)"}${sufijo}`,
    });
    return estado;
  } catch (e) {
    console.error("[enviarFinalizacion]", e instanceof Error ? e.message : e);
    return "ERROR";
  }
}

// Email del ALTA EN MODO MANUAL (22/08, pedido de Matthias): UN solo correo con los
// servicios contratados, la factura inicial si la hay (IBAN + tarjeta, como la solicitud
// de pago) y la hoja de encargo + el mandato ADJUNTOS para firmar. El gestor lo valida
// desde el alta viendo exactamente qué va a salir. Devuelve el estado del envío para
// que la ruta se lo cuente al gestor (nada de fallos silenciosos con un cliente real).
export async function enviarEncargoManual(
  admin: SupabaseClient,
  opts: {
    expedienteId: string;
    destino: string; // email ya validado por la ruta
    serviciosLabels: string[]; // etiquetas de los servicios contratados
    factura?: { facturaId: string; numero: string; total: number } | null;
    adjuntos?: { filename: string; content: string }[]; // hoja/mandato en base64
    baseUrl?: string;
    // Precio TOTAL del trámite con IVA (honorarios + tasas), calculado en el servidor.
    // Sin él, la factura del anticipo se leía como el precio entero — lo señaló Matthias.
    totalTramite?: number | null;
  },
): Promise<Estado> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("workspaceId, oficinaId, referencia, Cliente(nombre), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { workspaceId: string; oficinaId?: string | null; referencia: string; Cliente: { nombre: string | null } | { nombre: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return "ERROR";
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(uno(exp.Cliente)?.nombre ?? "cliente");

    const serviciosHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0"><tr><td style="background:#F8FAF7;border:1px solid #E2E8F0;border-radius:12px;padding:14px 18px">
      <p style="margin:0 0 6px;font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b">Servicios contratados</p>
      ${opts.serviciosLabels.map((l) => `<p style="margin:2px 0;font-family:${FUENTE};font-size:14px;font-weight:600;color:#1e293b">· ${l}</p>`).join("")}
    </td></tr></table>`;

    // El importe de HOY frente al precio del trámite. Tres casos: pago inicial (queda
    // resto), pago único (cubre el total) y sin cobro ahora (solo se anuncia el total).
    const total = opts.totalTramite && opts.totalTramite > 0 ? opts.totalTramite : null;
    const restoDespues = total && opts.factura ? Math.round((total - opts.factura.total) * 100) / 100 : 0;
    const parcial = restoDespues > 0.01;
    let pagoHtml = "";
    if (opts.factura) {
      pagoHtml = await bloquePagoHtml(admin, {
        workspaceId: exp.workspaceId, oficinaId: exp.oficinaId ?? null, factura: opts.factura, baseUrl: opts.baseUrl,
        etiqueta: parcial ? "Pago inicial" : "Importe a pagar",
        nota: total
          ? (parcial
              ? `Total del trámite: ${fmtEur(total)} · resto al finalizar: ${fmtEur(restoDespues)}`
              : "Es el importe total del trámite: no queda nada pendiente.")
          : undefined,
      });
    } else if (total) {
      // Sin cobro inicial: el cliente merece saber igualmente cuánto cuesta su trámite.
      pagoHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td align="center" style="background:#F8FAF7;border:1px solid #E2E8F0;border-radius:12px;padding:16px;text-align:center">
        <p style="margin:0;font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b">Total del trámite · IVA incluido</p>
        <p style="margin:5px 0 0;font-family:${FUENTE};font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1">${fmtEur(total)}</p>
        <p style="margin:6px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b">Te enviaremos la factura más adelante.</p>
      </td></tr></table>`;
    }

    const responder = await emailDeRespuesta(admin, exp.workspaceId);
    const firmaHtml = opts.adjuntos?.length
      ? `<p style="margin:18px 0 0;font-family:${FUENTE};font-size:14px;color:#475569;line-height:1.65">Te adjuntamos la <strong>hoja de encargo</strong> y el <strong>mandato de representación</strong>. Por favor, fírmalos y ${responder ? "envíanoslos respondiendo a este correo" : "háznoslos llegar"} para que podamos actuar en tu nombre.</p>`
      : "";

    const html = emailLayout({
      avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
      gestoria,
      titulo: "Hemos puesto en marcha tu trámite",
      cuerpoHtml: `<p style="margin:0 0 2px">Hola ${nombre},</p>
        <p style="margin:0">${gestoria} ya está trabajando en tu trámite (expediente <strong>${exp.referencia}</strong>). Aquí tienes el detalle:</p>
        ${serviciosHtml}
        ${pagoHtml}
        ${firmaHtml}`,
      cta: null,
      // Aquí SÍ esperamos respuesta (los documentos firmados): el reply-to va al
      // despacho, así que invitar a responder es honesto.
      footerNota: responder
        ? `Mensaje de ${gestoria}. Puedes responder a este correo: tu respuesta llega directamente a tu gestoría.`
        : `Mensaje de ${gestoria}.`,
      preheader: `Tu trámite con ${gestoria}${opts.factura ? ` · ${fmtEur(opts.factura.total)}` : ""}`,
    });

    let estado: Estado = "SIMULADO";
    let idMensaje: string | null = null; // id del proveedor: rastro para soporte
    if (resendDisponible()) {
      const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      const { data: env, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from,
        to: opts.destino,
        subject: `Tu trámite con ${gestoria} · ${exp.referencia}`,
        html,
        text: [
          `Hola ${nombre}, ${gestoria} ya está trabajando en tu trámite (${exp.referencia}).`,
          `Servicios: ${opts.serviciosLabels.join(" + ")}.`,
          ...(total ? [`Total del trámite: ${fmtEur(total)} (IVA incluido).`] : []),
          ...(opts.factura
            ? [`${parcial ? "Pago inicial" : "A pagar"} — factura ${opts.factura.numero}: ${fmtEur(opts.factura.total)}.`]
            : []),
          ...(parcial ? [`Resto al finalizar: ${fmtEur(restoDespues)}.`] : []),
          ...(opts.adjuntos?.length ? ["Adjuntamos la hoja de encargo y el mandato para firmar."] : []),
        ].join("\n"),
        attachments: opts.adjuntos?.length ? opts.adjuntos : undefined,
        ...(responder ? { replyTo: responder } : {}),
      });
      estado = error ? "ERROR" : "ENVIADO";
      if (error) console.error("[encargoManual email]", error.message ?? error);
      else idMensaje = env?.id ?? null;
    }
    console.log(`[encargoManual ${estado}${idMensaje ? ` id=${idMensaje}` : ""}] email → ${opts.destino} | ${exp.referencia} | ${opts.serviciosLabels.join(" + ")}`);

    const partes = [
      opts.serviciosLabels.join(" + "),
      ...(opts.factura ? [`factura ${opts.factura.numero} (${fmtEur(opts.factura.total)})`] : []),
      ...(opts.adjuntos?.length ? ["hoja de encargo y mandato adjuntos"] : []),
    ].join(" · ");
    const { sufijo } = iconoYSufijo(estado, null);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `📨 Encargo enviado al cliente: ${partes}${sufijo}`,
    });
    return estado;
  } catch (e) {
    console.error("[enviarEncargoManual]", e instanceof Error ? e.message : e);
    return "ERROR";
  }
}

// Confirmación de pago RECIBIDO (tarjeta o transferencia) → email al cliente SIN IBAN
// (ya está pagada): solo agradecimiento + enlace de seguimiento. Se envía cuando una
// factura pasa a PAGADA. No casser el flux appelant.
export async function enviarConfirmacionPago(
  admin: SupabaseClient,
  opts: { expedienteId: string; numero: string; total: number; metodo?: "TARJETA" | "TRANSFERENCIA" | "EFECTIVO" | "OTRO"; baseUrl?: string },
): Promise<void> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("workspaceId, portalToken, Cliente(nombre, email, telefono), Workspace(nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as { workspaceId: string; portalToken: string | null; Cliente: { nombre: string | null; email: string | null; telefono: string | null } | { nombre: string | null; email: string | null; telefono: string | null }[] | null; Workspace: { nombre: string | null } | { nombre: string | null }[] | null } | null;
    if (!exp) return;
    const cliente = uno(exp.Cliente);
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    // OTRO (Bizum, cheque…): no se inventa el medio — la frase queda sin coletilla.
    const via = opts.metodo === "TARJETA" ? " con tarjeta" : opts.metodo === "EFECTIVO" ? " en efectivo" : opts.metodo === "OTRO" ? "" : " por transferencia";
    const link = exp.portalToken && opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    const cuerpoHtml = `<p style="margin:0 0 2px">Hola ${nombre},</p>
      <p style="margin:0">hemos recibido tu pago${via} de la factura <strong>${opts.numero}</strong> (${fmtEur(opts.total)}). ¡Gracias! Seguimos avanzando con tu trámite.</p>`;
    const html = emailLayout({
      avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
      gestoria,
      titulo: "Pago recibido ✓",
      cuerpoHtml,
      cta: link ? { url: link, label: "Ver mi expediente" } : null,
      footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: `Pago recibido · factura ${opts.numero} · ${fmtEur(opts.total)}`,
    });

    const canal = quiereCanales(await fetchCanalAvisos(admin, exp.workspaceId));

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible()) {
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from, to: destino, subject: `Pago recibido · factura ${opts.numero}`, html, text: `Hemos recibido tu pago ${via} de la factura ${opts.numero} (${fmtEur(opts.total)}). ¡Gracias!`,
        });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[confirmacionPago email]", error.message ?? error);
      }
      console.log(`[confirmacionPago ${estadoEmail}] email → ${cliente?.email || "(sin email)"} | factura ${opts.numero} | ${via}`);
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      const texto = `Hemos recibido tu pago ${via} de la factura ${opts.numero} (${fmtEur(opts.total)}). ¡Gracias! Seguimos avanzando con tu trámite.`;
      estadoWa = await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo: texto, link });
      console.log(`[confirmacionPago ${estadoWa}] whatsapp → ${cliente?.telefono || "(sin teléfono)"} | factura ${opts.numero}`);
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    const { icono, sufijo } = iconoYSufijo(estadoEmail, estadoWa);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `${icono} Confirmación de pago enviada al cliente (factura ${opts.numero})${sufijo}`,
    });
  } catch (e) {
    console.error("[enviarConfirmacionPago]", e instanceof Error ? e.message : e);
  }
}

// Confirmación de CITA PREVIA (consulta) al cliente: fecha/hora/lugar/motivo. Sin DB,
// solo envía si hay email y Resend. Devuelve true si se envió.
// Invitación de calendario (.ics) para citas con hora y duración — el cliente la abre
// y la cita entra en su calendario con el enlace de la videollamada. Hora FLOTANTE
// (sin zona): correcta para gestor y cliente en España sin arrastrar VTIMEZONE.
function icsCitaPrevia(o: { uid: string; gestoria: string; fecha: string; hora: string; duracion: number; lugar: string; enlace?: string | null }): string {
  const [y, mo, d] = o.fecha.split("-").map(Number);
  const [h, mi] = o.hora.split(":").map(Number);
  const ini = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const fin = new Date(ini.getTime() + o.duracion * 60000);
  const fmt = (x: Date) => x.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "T"); // YYYYMMDDTHHMMSS
  const limpio = (s: string) => s.replace(/[\r\n;,]/g, " ").trim();
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aproba//Citas//ES", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${o.uid}@aproba-software.com`,
    `DTSTAMP:${fmt(ini)}`,
    `DTSTART:${fmt(ini)}`,
    `DTEND:${fmt(fin)}`,
    `SUMMARY:Cita con ${limpio(o.gestoria)}`,
    `LOCATION:${limpio(o.lugar)}`,
    ...(o.enlace ? [`DESCRIPTION:Enlace para unirse: ${o.enlace}`, `URL:${o.enlace}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export async function enviarConfirmacionCitaPrevia(opts: {
  nombre: string; email: string; gestoria: string; fecha: string; hora?: string | null; duracion?: number | null; precio?: number | null; lugar?: string | null; motivo?: string | null;
  actualizada?: boolean; // true → email "Tu cita ha sido modificada" (mismos datos, otro wording)
  videoProveedor?: "meet" | "teams" | "otro" | null; videoEnlace?: string | null; citaId?: string | null;
  avatarUrl?: string | null; // foto del gestor que creó la cita
  // Cobro de la cita (opt-in del gestor): el email deja de ser solo informativo y
  // explica CÓMO pagar — IBAN y/o botón de tarjeta. Mismo bloque visual que el
  // email de factura, para que el cliente reconozca el circuito.
  cobro?: {
    facturaId: string; numero: string; total: number; baseUrl: string;
    transferencia: boolean; tarjeta: boolean;
    cuenta?: { titular?: string | null; iban?: string | null; banco?: string | null } | null;
  } | null;
}): Promise<boolean> {
  try {
    if (!opts.email || !resendDisponible()) return false;
    const [a, m, d] = String(opts.fecha).split("-");
    const fmtDur = (min: number) => { const h = Math.floor(min / 60), mm = min % 60; return h ? `${h} h${mm ? ` ${mm} min` : ""}` : `${mm} min`; };
    const cuando = `${d}/${m}/${a}${opts.hora ? ` a las ${opts.hora}` : ""}${opts.duracion ? ` (${fmtDur(opts.duracion)})` : ""}`;
    const fila = (k: string, v: string) => `<tr><td style="padding:3px 18px 3px 0;color:#64748b;text-align:left">${k}</td><td style="font-weight:600;text-align:left">${v}</td></tr>`;
    // "otro" = herramienta cualquiera (Zoom…): etiqueta genérica, sin paréntesis redundante.
    const provLabel = opts.videoProveedor === "teams" ? "Microsoft Teams" : opts.videoProveedor === "meet" ? "Google Meet" : null;
    const esVideo = Boolean(opts.videoEnlace);
    const lugarVideo = provLabel ? `Videollamada (${provLabel})` : "Videollamada";
    const detalle = [
      fila("Fecha", cuando),
      esVideo ? fila("Lugar", lugarVideo) : opts.lugar ? fila("Lugar", opts.lugar) : "",
      opts.motivo ? fila("Motivo", opts.motivo) : "",
      opts.precio != null ? fila("Precio", opts.precio === 0 ? "Gratis" : fmtEur(opts.precio)) : "",
    ].join("");
    const mod = Boolean(opts.actualizada);
    const intro = mod
      ? `Hola ${primerNombre(opts.nombre)}, tu cita con <strong>${opts.gestoria}</strong> ha sido modificada. Estos son los nuevos datos:`
      : `Hola ${primerNombre(opts.nombre)}, tu cita con <strong>${opts.gestoria}</strong> está confirmada:`;
    // Bloque de pago (solo si el gestor marcó cobrar): datos de transferencia y/o
    // botón de tarjeta. El importe mostrado es el de la FACTURA (con IVA), no el
    // precio suelto de la cita — es lo que el cliente va a pagar de verdad.
    const c = opts.cobro ?? null;
    const ibanBox = c && c.transferencia
      ? (c.cuenta?.iban
        ? `<p style="margin:0 0 8px;font-family:${FUENTE};font-size:14px;color:#475569">Puedes pagar por <strong>transferencia bancaria</strong> a esta cuenta:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;font-family:${FUENTE};font-size:14px;color:#1e293b">
            ${c.cuenta.titular ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Titular</td><td style="font-weight:600;text-align:left">${c.cuenta.titular}</td></tr>` : ""}
            <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">IBAN</td><td style="font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;letter-spacing:0.02em;text-align:left">${c.cuenta.iban}</td></tr>
            ${c.cuenta.banco ? `<tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Banco</td><td style="font-weight:600;text-align:left">${c.cuenta.banco}</td></tr>` : ""}
            <tr><td style="padding:3px 16px 3px 0;color:#64748b;text-align:left">Concepto</td><td style="font-weight:600;text-align:left">${c.numero}</td></tr>
          </table>`
        : `<p style="margin:0;font-family:${FUENTE};font-size:14px;color:#64748b">Tu gestoría te facilitará los datos para realizar el pago.</p>`)
      : "";
    const botonTarjeta = c && c.tarjeta
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="text-align:center;padding-top:${ibanBox ? "16px" : "4px"}"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${c.baseUrl}/api/pagos/checkout?f=${c.facturaId}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Pagar ${fmtEur(c.total)} con tarjeta</a></td></tr></table></td></tr></table>`
      : "";
    const bloquePago = c
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr><td align="center" style="background:#ECFDF5;border:1px solid #C7EFDD;border-radius:12px;padding:18px;text-align:center">
          <p style="margin:0 0 10px;font-family:${FUENTE};font-size:14px;color:#0f172a"><strong>Importe a pagar: ${fmtEur(c.total)}</strong> · factura ${c.numero}</p>
          ${ibanBox}${botonTarjeta}
        </td></tr></table>`
      : "";
    // Con cobro, el botón de la videollamada NO puede quedar debajo del recuadro de
    // pago (el layout pone su CTA al final): unirse a la reunión es la acción del día,
    // pagar puede esperar. Se pinta aquí, justo ENCIMA del bloque verde, y el layout
    // se queda sin CTA para no duplicarlo. Sin cobro, todo sigue igual.
    const etiquetaVideo = provLabel ? `Unirse a la videollamada (${provLabel})` : "Unirse a la videollamada";
    const botonVideo = esVideo && opts.videoEnlace && c
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="text-align:center;padding-top:20px"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td bgcolor="#0E8C5F" style="border-radius:10px"><a href="${opts.videoEnlace}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${etiquetaVideo}</a></td></tr></table></td></tr></table>`
      : "";
    const cuerpoHtml = `<p style="margin:0 0 12px">${intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;font-family:${FUENTE};font-size:14px;color:#1e293b">${detalle}</table>
      ${botonVideo}${bloquePago}`;
    const html = emailLayout({
      avatarUrl: opts.avatarUrl ?? null,
      gestoria: opts.gestoria,
      titulo: mod ? "Tu cita ha sido modificada" : "Tu cita está confirmada",
      cuerpoHtml,
      // Videollamada → botón para unirse; la invitación .ics va adjunta.
      // Sin cobro: el botón va donde siempre (al final, vía el layout). Con cobro ya
      // está pintado encima del bloque de pago — no repetirlo.
      cta: esVideo && opts.videoEnlace && !c ? { url: opts.videoEnlace, label: etiquetaVideo } : null,
      footerNota: `Mensaje de ${opts.gestoria}. Por favor, no respondas a este correo.`,
      preheader: mod ? `Cita modificada: ${cuando}` : `Cita: ${cuando}`,
    });
    // Adjunto .ics cuando hay hora y duración (siempre en videollamadas): el cliente
    // añade la cita a su calendario con un toque, con el enlace dentro.
    const conIcs = Boolean(opts.hora && opts.duracion);
    const adjuntos = conIcs
      ? [{
          filename: "invitacion.ics",
          content: Buffer.from(icsCitaPrevia({
            uid: opts.citaId || `${opts.fecha}-${opts.hora}`,
            gestoria: opts.gestoria,
            fecha: opts.fecha,
            hora: opts.hora as string,
            duracion: opts.duracion as number,
            lugar: esVideo ? lugarVideo : (opts.lugar || "Por confirmar"),
            enlace: opts.videoEnlace ?? null,
          })).toString("base64"),
        }]
      : undefined;
    const from = `"${String(opts.gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: opts.email, subject: mod ? `Cita modificada · ${opts.gestoria}` : `Cita confirmada · ${opts.gestoria}`, html,
      text: [
        mod
          ? `Tu cita con ${opts.gestoria} ha sido modificada: ${cuando}${esVideo ? ` · ${lugarVideo}: ${opts.videoEnlace}` : opts.lugar ? ` · ${opts.lugar}` : ""}.`
          : `Tu cita con ${opts.gestoria}: ${cuando}${esVideo ? ` · ${lugarVideo}: ${opts.videoEnlace}` : opts.lugar ? ` · ${opts.lugar}` : ""}.`,
        ...(c ? [`Importe: ${fmtEur(c.total)} (factura ${c.numero}).`] : []),
        ...(c && c.transferencia && c.cuenta?.iban ? [`Transferencia — IBAN: ${c.cuenta.iban} · Concepto: ${c.numero}`] : []),
        ...(c && c.tarjeta ? [`Pagar con tarjeta: ${c.baseUrl}/api/pagos/checkout?f=${c.facturaId}`] : []),
      ].join("\n"),
      attachments: adjuntos,
    });
    return !error;
  } catch (e) {
    console.error("[enviarConfirmacionCitaPrevia]", e instanceof Error ? e.message : e);
    return false;
  }
}

// Recordatorio MANUAL (el gestor pulsa «Recordar al cliente»): email al cliente con la
// LISTA de documentos que faltan + botón para subirlos. NO idempotente (se puede reenviar).
// Devuelve el resultado para que la ruta informe al gestor.
export async function enviarRecordatorioDocs(
  admin: SupabaseClient,
  opts: { expedienteId: string; baseUrl?: string },
): Promise<{ enviado: boolean; faltan: number; motivo?: "sin_faltan" | "sin_email" | "sin_telefono" | "sin_contacto" | "simulado" | "error" }> {
  try {
    let resExp = await admin
      .from("Expediente")
      .select("portalToken, tipo, servicioClave, serviciosExtra, docsExtra, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    if (resExp.error) resExp = await admin
      .from("Expediente")
      .select("portalToken, tipo, servicioClave, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre), documentos:Documento(tipo, estado)")
      .eq("id", opts.expedienteId)
      .maybeSingle() as typeof resExp;
    const expRaw = resExp.data;
    const exp = expRaw as {
      portalToken: string | null;
      tipo: string;
      servicioClave: string | null;
      serviciosExtra?: string[] | null;
      Cliente: { nombre: string | null; email: string | null; telefono?: string | null; idioma?: string | null } | { nombre: string | null; email: string | null; telefono?: string | null; idioma?: string | null }[] | null;
      Workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
      documentos: { tipo: string; estado: string }[] | null;
    } | null;
    if (!exp) return { enviado: false, faltan: 0, motivo: "error" };
    const cliente = uno(exp.Cliente);
    const ws = uno(exp.Workspace);
    const gestoria = ws?.nombre ?? "Tu gestoría";
    const lang = (esLangSoportada(cliente?.idioma) ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = exp.portalToken && opts.baseUrl ? `${opts.baseUrl}/s/${exp.portalToken}` : null;

    let faltantes: string[] = [];
    if (ws?.id) {
      const sedeNtf = await (async () => {
        try {
          const { data: se } = await admin.from("Expediente").select("oficinaId").eq("id", opts.expedienteId).maybeSingle();
          return ((se as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
        } catch { return null; }
      })();
      const servicios = await fetchServiciosDeWorkspace(admin, ws.id, sedeNtf);
      const requeridos = docsDeExpediente(serviciosDeExpediente(exp, servicios), (exp as { docsExtra?: unknown }).docsExtra);
      faltantes = docsFaltantes(requeridos, exp.documentos ?? []);
    }
    if (!faltantes.length) return { enviado: false, faltan: 0, motivo: "sin_faltan" };
    const canal = quiereCanales(ws?.id ? await fetchCanalAvisos(admin, ws.id) : "EMAIL");

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible() && link) {
        const lista = faltantes.map((d) => `<li style="margin:3px 0">${d}</li>`).join("");
        const cuerpoHtml = `<p style="margin:0 0 10px">${t("notif.recDocs.intro", { nombre })}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td style="text-align:left"><ul style="margin:0;padding-left:20px;font-family:${FUENTE};font-size:15px;color:#1e293b">${lista}</ul></td></tr></table>
          <p style="margin:14px 0 0">${t("notif.recDocs.outro")}</p>`;
        const html = emailLayout({
          avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
          gestoria,
          titulo: t("notif.recDocs.titulo"),
          cuerpoHtml,
          cta: link ? { url: link, label: t("notif.seg.botonSubir") } : null,
          footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
          preheader: t("notif.recDocs.titulo"),
        });
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from, to: destino, subject: t("notif.recDocs.subject", { gestoria }), html,
          text: `${t("notif.recDocs.intro", { nombre })} ${faltantes.join(", ")}. ${link ?? ""}`,
        });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[recordatorioDocs email]", error.message ?? error);
      }
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      const texto = `${t("notif.recDocs.intro", { nombre })}\n• ${faltantes.join("\n• ")}\n${t("notif.recDocs.outro")}`;
      estadoWa = telefonoE164(cliente?.telefono) === null ? "SIN_CONTACTO"
        : link ? await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo: texto, link }) : "SIMULADO";
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    // Sin NINGÚN contacto utilizable → mismo aviso al gestor que antes (sin evento).
    const global = estadoGlobal([estadoEmail, estadoWa]);
    if (global === "SIN_CONTACTO") return { enviado: false, faltan: faltantes.length, motivo: motivoSinContacto(estadoEmail, estadoWa) };

    const { icono, sufijo } = iconoYSufijo(estadoEmail, estadoWa);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `${icono} Recordatorio de documentos enviado al cliente (${faltantes.length})${sufijo}`,
    });
    if (global === "ERROR") return { enviado: false, faltan: faltantes.length, motivo: "error" };
    return { enviado: global === "ENVIADO", faltan: faltantes.length, motivo: global === "SIMULADO" ? "simulado" : undefined };
  } catch (e) {
    console.error("[enviarRecordatorioDocs]", e instanceof Error ? e.message : e);
    return { enviado: false, faltan: 0, motivo: "error" };
  }
}

// ── VIGÍA: la gestoría inicia una renovación → aviso al cliente EN SU IDIOMA ──
// Enlace al portal /j del expediente de renovación recién creado (el cliente revisa
// sus datos y sube los documentos). Mejor esfuerzo: nunca lanza.
export async function enviarAvisoRenovacion(
  admin: SupabaseClient,
  opts: { expedienteId: string; tipoVencimiento?: string; fechaCaducidad?: string | null; baseUrl?: string },
): Promise<{ enviado: boolean; motivo?: "sin_email" | "sin_telefono" | "sin_contacto" | "simulado" | "error" }> {
  try {
    const { data: expRaw } = await admin
      .from("Expediente")
      .select("portalToken, Cliente(nombre, email, telefono, idioma), Workspace(id, nombre)")
      .eq("id", opts.expedienteId)
      .maybeSingle();
    const exp = expRaw as {
      portalToken: string | null;
      Cliente: { nombre: string | null; email: string | null; telefono?: string | null; idioma?: string | null } | { nombre: string | null; email: string | null; telefono?: string | null; idioma?: string | null }[] | null;
      Workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
    } | null;
    if (!exp) return { enviado: false, motivo: "error" };
    const cliente = uno(exp.Cliente);
    const gestoria = uno(exp.Workspace)?.nombre ?? "Tu gestoría";
    const lang = (esLangSoportada(cliente?.idioma) ? cliente!.idioma : "es") as Lang;
    const t = makeT(lang);
    const nombre = primerNombre(cliente?.nombre ?? "cliente");
    const link = exp.portalToken && opts.baseUrl ? `${opts.baseUrl}/j/${exp.portalToken}` : null;

    const tipo = opts.tipoVencimiento ?? "TIE";
    // dd/mm/aaaa en la lengua del cliente (fecha ISO → local es suficiente aquí).
    const fecha = opts.fechaCaducidad ? new Date(opts.fechaCaducidad).toLocaleDateString(lang === "en" ? "en-GB" : lang) : null;
    const body = fecha
      ? t("notif.renov.body", { nombre, tipo, fecha, gestoria })
      : t("notif.renov.bodySinFecha", { nombre, tipo, gestoria });

    const html = emailLayout({
      avatarUrl: await fotoDelExpediente(admin, opts.expedienteId),
      gestoria,
      titulo: t("notif.renov.titulo"),
      cuerpoHtml: `<p style="margin:0">${body}</p>`,
      cta: link ? { url: link, label: t("notif.renov.boton") } : null,
      footerNota: `Mensaje automático de ${gestoria}. Por favor, no respondas a este correo.`,
      preheader: t("notif.renov.titulo"),
    });

    const ws = uno(exp.Workspace);
    const canal = quiereCanales(ws?.id ? await fetchCanalAvisos(admin, ws.id) : "EMAIL");

    let estadoEmail: Estado | null = null;
    const enviarEmailAviso = async () => {
      estadoEmail = "SIMULADO";
      const destino = cliente?.email ?? "";
      if (!destino) {
        estadoEmail = "SIN_CONTACTO";
      } else if (resendDisponible()) {
        const from = `"${String(gestoria).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from, to: destino, subject: t("notif.renov.subject", { gestoria }), html,
          text: `${body} ${link ?? ""}`,
        });
        estadoEmail = error ? "ERROR" : "ENVIADO";
        if (error) console.error("[avisoRenovacion email]", error.message ?? error);
      }
    };
    if (canal.email) await enviarEmailAviso();

    let estadoWa: Estado | null = null;
    if (canal.whatsapp) {
      estadoWa = await enviarWhatsApp({ telefono: cliente?.telefono, gestoria, cuerpo: body, link });
    }
    // WhatsApp falló o no había teléfono, y el email no había salido (canal WHATSAPP
    // a secas): el cliente no puede quedarse sin su aviso → repli por email
    // (caso real Gestoría S&D: Twilio en sandbox, envíos reales en error).
    if ((estadoWa === "ERROR" || estadoWa === "SIN_CONTACTO") && estadoEmail === null) await enviarEmailAviso();

    // Sin ningún contacto utilizable → mismo retorno que antes (sin evento).
    const global = estadoGlobal([estadoEmail, estadoWa]);
    if (global === "SIN_CONTACTO") return { enviado: false, motivo: motivoSinContacto(estadoEmail, estadoWa) };

    const { icono, sufijo } = iconoYSufijo(estadoEmail, estadoWa);
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: opts.expedienteId,
      tipo: "NOTIFICACION_ENVIADA",
      descripcion: `${icono} Aviso de renovación enviado al cliente${sufijo}`,
    });
    if (global === "ERROR") return { enviado: false, motivo: "error" };
    return { enviado: global === "ENVIADO", motivo: global === "SIMULADO" ? "simulado" : undefined };
  } catch (e) {
    console.error("[enviarAvisoRenovacion]", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "error" };
  }
}
