import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearPlantilla, estadoPlantillas, type PlantillaDef } from "@/lib/whatsapp-meta";

// PLANTILLAS de Aproba en el WABA de cada despacho. Fuera de la ventana de 24 h, Meta solo
// entrega mensajes iniciados por el negocio si van en una plantilla APROBADA: se crean al
// conectar (categoría UTILITY) y su estado llega por webhook (message_template_status_update).
// UNA plantilla genérica de aviso con 3 variables — el mismo diseño que la de Twilio, para
// que los 6 puntos de envío de lib/notificaciones no cambien: {{1}} despacho · {{2}} texto
// · {{3}} enlace. Meta prohíbe saltos de línea DENTRO de las variables (se sanean a « · »).
export const PLANTILLA_AVISO = "aproba_aviso";
export const PLANTILLAS: PlantillaDef[] = [
  { name: PLANTILLA_AVISO, language: "es", category: "UTILITY",
    body: "*{{1}}* — actualización sobre tu trámite de extranjería:\n\n{{2}}\n\nMás información y acceso a tu expediente:\n{{3}}",
    ejemplo: ["Gestoría Vallès", "Hemos recibido tu pasaporte y ya está validado.", "https://aproba-software.com/s/abc123"] },
  { name: PLANTILLA_AVISO, language: "en", category: "UTILITY",
    body: "*{{1}}* — update on your immigration procedure:\n\n{{2}}\n\nMore information and access to your file:\n{{3}}",
    ejemplo: ["Gestoría Vallès", "We have received your passport and it is now validated.", "https://aproba-software.com/s/abc123"] },
  { name: PLANTILLA_AVISO, language: "fr", category: "UTILITY",
    body: "*{{1}}* — mise à jour de ta démarche d'immigration :\n\n{{2}}\n\nPlus d'informations et accès à ton dossier :\n{{3}}",
    ejemplo: ["Gestoría Vallès", "Nous avons reçu ton passeport, il est validé.", "https://aproba-software.com/s/abc123"] },
];

export const APROBADA = "APPROVED";
export const plantillaAprobada = (plantillas: Record<string, string>, idioma: string) =>
  plantillas[`${PLANTILLA_AVISO}:${idioma}`] === APROBADA ? idioma : plantillas[`${PLANTILLA_AVISO}:es`] === APROBADA ? "es" : null;

// Crea las que falten y guarda el estado actual (idempotente: Meta rechaza duplicados por nombre+idioma).
export async function asegurarPlantillas(admin: SupabaseClient, token: string, wabaId: string, phoneNumberId: string): Promise<Record<string, string>> {
  let actuales: Record<string, string> = {};
  try { actuales = await estadoPlantillas(token, wabaId); } catch { /* sin permiso todavía */ }
  for (const p of PLANTILLAS) {
    if (actuales[`${p.name}:${p.language}`]) continue;
    try { const r = await crearPlantilla(token, wabaId, p); actuales[`${p.name}:${p.language}`] = r.status ?? "PENDING"; }
    catch (e) { console.error("[whatsapp plantilla]", p.name, p.language, e instanceof Error ? e.message : e); actuales[`${p.name}:${p.language}`] = "ERROR"; }
  }
  await admin.from("WhatsAppCuenta").update({ plantillas: actuales, updatedAt: new Date().toISOString() }).eq("phoneNumberId", phoneNumberId);
  return actuales;
}
