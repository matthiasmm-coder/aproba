import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Envío de WhatsApp al cliente vía Twilio (API REST directa, sin SDK). Mismo diseño de
// «repli propre» que el email Resend en lib/notificaciones.ts: sin credenciales → el
// mensaje se registra como SIMULADO (la app funciona idéntica en dev/demo); sin teléfono
// utilizable → SIN_CONTACTO. Nunca lanza: un aviso jamás rompe el flujo llamante.
//
// Env (número central de Aproba, como el remitente de email):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (E.164, ej. +14155238886)
//
// Producción: los mensajes iniciados por el negocio fuera de la ventana de 24 h exigen
// plantilla aprobada por Meta (Twilio Content API). Este módulo centraliza el envío para
// que ese cambio sea un solo punto.

export const whatsappDisponible = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);

// Canales EFECTIVOS de un aviso según el canal elegido y la disponibilidad real de
// WhatsApp en la plataforma. Garde-fou (agujero real: Gestoría S&D, 14/07): con canal
// WHATSAPP y Twilio sin configurar, el cliente no recibía NADA — mientras WhatsApp no
// esté disponible, esos avisos se entregan por email.
export const canalesEfectivos = (canal: CanalAvisos, waDisponible: boolean) => ({
  email: canal !== "WHATSAPP" || !waDisponible,
  whatsapp: canal !== "EMAIL",
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

export async function enviarWhatsApp(opts: { telefono: string | null | undefined; texto: string }): Promise<EstadoWhatsApp> {
  const to = telefonoE164(opts.telefono);
  if (!to) return "SIN_CONTACTO";
  if (!whatsappDisponible()) {
    console.log(`[whatsapp SIMULADO] → ${to} | ${opts.texto.replace(/\n/g, " · ")}`);
    return "SIMULADO";
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        To: `whatsapp:${to}`,
        Body: opts.texto,
      }).toString(),
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
