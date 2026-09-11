import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Envío de WhatsApp al cliente vía Twilio (API REST directa, sin SDK). Mismo diseño de
// «repli propre» que el email Resend en lib/notificaciones.ts: sin credenciales → el
// mensaje se registra como SIMULADO (la app funciona idéntica en dev/demo); sin teléfono
// utilizable → SIN_CONTACTO. Nunca lanza: un aviso jamás rompe el flujo llamante.
//
// Env (número central de Aproba, como el remitente de email):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (E.164, ej. +14155238886)
//   TWILIO_CONTENT_SID (opcional, HX…): SID de la plantilla aprobada por Meta.
//
// DOS modos de envío, decididos por la presencia de TWILIO_CONTENT_SID:
//  - SIN ContentSid → texto libre (Body). Solo funciona en el SANDBOX de Twilio (el
//    destinatario tiene que haber enviado «join <código>» antes) o dentro de la ventana
//    de 24 h. Para probar, no para clientes reales.
//  - CON ContentSid → plantilla aprobada (Content API): es el ÚNICO modo que entrega
//    mensajes iniciados por el negocio a cualquier número en producción. La plantilla
//    esperada tiene 3 variables: {{1}} gestoría, {{2}} cuerpo, {{3}} enlace.
//    ⚠️ Meta prohíbe saltos de línea en las variables → se sanean a « · ».

// Interruptor de PLATAFORMA (decisión 2026-07-26): WhatsApp APAGADO hasta tener un
// sender propio + plantilla aprobada por Meta (coste por mensaje + complejidad → solo
// email por ahora). Con él en false, TODOS los avisos salen por email, aunque un
// workspace tenga canalAvisos=WHATSAPP en base (S&D) — sin tocar su configuración.
// Para reactivar: ponerlo en true Y restaurar el selector de canal en
// components/avisos-manager.tsx (retirado en el mismo commit).
export const WHATSAPP_PLATAFORMA = false;

export const whatsappDisponible = () =>
  WHATSAPP_PLATAFORMA && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);

// Canales EFECTIVOS de un aviso según el canal elegido y la disponibilidad real de
// WhatsApp en la plataforma. Garde-fou (agujero real: Gestoría S&D, 14/07): con canal
// WHATSAPP y WhatsApp indisponible, el cliente no recibía NADA — esos avisos se
// entregan por email, y NO se intenta (ni journaliza) un WhatsApp que no puede salir.
export const canalesEfectivos = (canal: CanalAvisos, waDisponible: boolean) => ({
  email: canal !== "WHATSAPP" || !waDisponible,
  whatsapp: canal !== "EMAIL" && waDisponible,
});

export type EstadoWhatsApp = "ENVIADO" | "SIMULADO" | "SIN_CONTACTO" | "ERROR";

// telefonoE164 vive ahora en lib/whatsapp-util (puro, compartido con la recepción Meta).
export { telefonoE164 } from "@/lib/whatsapp-util";
import { telefonoE164 } from "@/lib/whatsapp-util";

// Variable de plantilla: Meta rechaza saltos de línea/tabs y variables enormes.
const varPlantilla = (s: string, max = 640) =>
  s.replace(/[\r\n\t]+/g, " · ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export async function enviarWhatsApp(opts: {
  telefono: string | null | undefined;
  gestoria: string;          // remitente lógico (el número central es de Aproba)
  cuerpo: string;            // texto del aviso (puede llevar saltos de línea)
  link?: string | null;      // enlace del portal, si lo hay
  // WhatsApp DEL DESPACHO (Meta, 12/09/2026): con workspaceId se busca su número conectado
  // y el aviso sale desde ÉL — dentro de la ventana de 24 h como texto, fuera como plantilla
  // aprobada en el idioma del cliente. Sin cuenta → transporte de plataforma (Twilio) como antes.
  workspaceId?: string | null;
  oficinaId?: string | null;
  idioma?: string | null;
  admin?: SupabaseClient;
}): Promise<EstadoWhatsApp> {
  const to = telefonoE164(opts.telefono);
  if (!to) return "SIN_CONTACTO";
  const gestoria = opts.gestoria.replace(/[*\r\n]/g, " ").trim() || "Tu gestoría";
  const textoLibre = `*${gestoria}*\n${opts.cuerpo}${opts.link ? `\n\n${opts.link}` : ""}`;
  if (opts.workspaceId && opts.admin) {
    const meta = await enviarPorMeta(opts.admin, { workspaceId: opts.workspaceId, oficinaId: opts.oficinaId ?? null, to, gestoria, cuerpo: opts.cuerpo, link: opts.link ?? null, idioma: opts.idioma ?? null, textoLibre });
    if (meta !== null) return meta; // había cuenta del despacho: su resultado manda
  }
  if (!whatsappDisponible()) {
    console.log(`[whatsapp SIMULADO] → ${to} | ${textoLibre.replace(/\n/g, " · ")}`);
    return "SIMULADO";
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const contentSid = process.env.TWILIO_CONTENT_SID;
    // La plantilla no admite variables vacías → el enlace cae al sitio de la app.
    const linkPlantilla = opts.link ?? (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
    const params: Record<string, string> = contentSid
      ? {
          From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          To: `whatsapp:${to}`,
          ContentSid: contentSid,
          ContentVariables: JSON.stringify({ "1": varPlantilla(gestoria, 80), "2": varPlantilla(opts.cuerpo), "3": varPlantilla(linkPlantilla, 300) }),
        }
      : { From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${to}`, Body: textoLibre };
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error(`[whatsapp ERROR ${res.status}]`, detalle.slice(0, 300));
      return "ERROR";
    }
    return "ENVIADO";
  } catch (e) {
    console.error("[whatsapp]", e instanceof Error ? e.message : e);
    return "ERROR";
  }
}

// ── Canal de avisos del workspace ────────────────────────────────────────────
// 'EMAIL' | 'WHATSAPP' | 'AMBOS' — columna Workspace.canalAvisos (migración
// supabase/whatsapp-canal.sql). Lectura defensiva: sin la columna → EMAIL (statu quo).

import { esCanalAvisos, type CanalAvisos } from "@/lib/avisos";
export type { CanalAvisos };

export async function fetchCanalAvisos(admin: SupabaseClient, workspaceId: string): Promise<CanalAvisos> {
  try {
    const { data, error } = await admin.from("Workspace").select("canalAvisos").eq("id", workspaceId).maybeSingle();
    if (error) return "EMAIL";
    const v = (data as { canalAvisos?: string | null } | null)?.canalAvisos;
    return esCanalAvisos(v) ? v : "EMAIL";
  } catch {
    return "EMAIL";
  }
}

// ── WhatsApp DEL DESPACHO (Meta Cloud API) ─────────────────────────────────────
import { cuentaDelWorkspace, enviarTexto, enviarPlantilla } from "@/lib/whatsapp-meta";
import { dentroDeVentana } from "@/lib/whatsapp-util";
import { PLANTILLA_AVISO, plantillaAprobada } from "@/lib/whatsapp-plantillas";

// null = este despacho no tiene número conectado (que decida el transporte de plataforma).
async function enviarPorMeta(admin: SupabaseClient, o: { workspaceId: string; oficinaId: string | null; to: string; gestoria: string; cuerpo: string; link: string | null; idioma: string | null; textoLibre: string }): Promise<EstadoWhatsApp | null> {
  const cuenta = await cuentaDelWorkspace(admin, o.workspaceId, o.oficinaId);
  if (!cuenta) return null;
  try {
    // Ventana de 24 h: último mensaje ENTRANTE de ese teléfono a este número.
    const { data: ult } = await admin.from("WhatsAppMensaje").select("timestamp").eq("cuentaId", cuenta.id).eq("telefono", o.to).eq("direccion", "IN").order("timestamp", { ascending: false }).limit(1).maybeSingle();
    const abierta = dentroDeVentana((ult as { timestamp?: string } | null)?.timestamp ?? null);
    let id = "", tipo = "text", texto = o.textoLibre;
    if (abierta) {
      ({ id } = await enviarTexto(cuenta, o.to, o.textoLibre, { previewUrl: Boolean(o.link) }));
    } else {
      const lang = plantillaAprobada(cuenta.plantillas, (o.idioma ?? "es").slice(0, 2));
      if (!lang) { console.error(`[whatsapp meta] sin plantilla aprobada para ${cuenta.telefono ?? cuenta.phoneNumberId} (${o.idioma ?? "es"})`); return "ERROR"; }
      const enlace = o.link ?? (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
      ({ id } = await enviarPlantilla(cuenta, o.to, PLANTILLA_AVISO, lang, [varPlantilla(o.gestoria, 80), varPlantilla(o.cuerpo), varPlantilla(enlace, 300)]));
      tipo = "template"; texto = `[${PLANTILLA_AVISO}/${lang}] ${o.cuerpo}`;
    }
    if (id) await admin.from("WhatsAppMensaje").insert({ id, workspaceId: o.workspaceId, cuentaId: cuenta.id, telefono: o.to, direccion: "OUT", tipo, texto: texto.slice(0, 4000), estado: "sent", timestamp: new Date().toISOString() }).then(() => {}, () => {});
    return "ENVIADO";
  } catch (e) {
    console.error("[whatsapp meta]", e instanceof Error ? e.message : e);
    return "ERROR";
  }
}

// ¿Puede este despacho enviar WhatsApp? Su número conectado (Meta) o el transporte de plataforma.
export async function whatsappDisponibleParaWorkspace(admin: SupabaseClient, workspaceId: string, oficinaId: string | null = null): Promise<boolean> {
  if (whatsappDisponible()) return true;
  return Boolean(await cuentaDelWorkspace(admin, workspaceId, oficinaId));
}
// Canales efectivos de un despacho: su preferencia (Workspace.canalAvisos) × lo que puede enviar de verdad.
export async function canalesDelWorkspace(admin: SupabaseClient, workspaceId: string | null | undefined, oficinaId: string | null = null): Promise<{ email: boolean; whatsapp: boolean }> {
  if (!workspaceId) return { email: true, whatsapp: false };
  return canalesEfectivos(await fetchCanalAvisos(admin, workspaceId), await whatsappDisponibleParaWorkspace(admin, workspaceId, oficinaId));
}
