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

// Normaliza a E.164: quita separadores, convierte «00…» en «+…» y añade +34 a un móvil
// español de 9 cifras (empiezan por 6 o 7 — los fijos no tienen WhatsApp). Devuelve null
// si el número no parece utilizable.
export function telefonoE164(telefono: string | null | undefined): string | null {
  const limpio = (telefono ?? "").replace(/[\s\-().]/g, "");
  if (!limpio) return null;
  const conPrefijo = limpio.startsWith("00") ? `+${limpio.slice(2)}` : limpio;
  if (/^\+\d{8,15}$/.test(conPrefijo)) return conPrefijo;
  if (/^[67]\d{8}$/.test(conPrefijo)) return `+34${conPrefijo}`;
  return null;
}

// Variable de plantilla: Meta rechaza saltos de línea/tabs y variables enormes.
const varPlantilla = (s: string, max = 640) =>
  s.replace(/[\r\n\t]+/g, " · ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export async function enviarWhatsApp(opts: {
  telefono: string | null | undefined;
  gestoria: string;          // remitente lógico (el número central es de Aproba)
  cuerpo: string;            // texto del aviso (puede llevar saltos de línea)
  link?: string | null;      // enlace del portal, si lo hay
}): Promise<EstadoWhatsApp> {
  const to = telefonoE164(opts.telefono);
  if (!to) return "SIN_CONTACTO";
  const gestoria = opts.gestoria.replace(/[*\r\n]/g, " ").trim() || "Tu gestoría";
  const textoLibre = `*${gestoria}*\n${opts.cuerpo}${opts.link ? `\n\n${opts.link}` : ""}`;
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
