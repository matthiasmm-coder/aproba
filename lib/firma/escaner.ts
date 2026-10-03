import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailDeRespuesta } from "@/lib/notificaciones";
import { evidencia, type SobreFila } from "@/lib/firma/servicio";
import { enviarSolicitudFirma } from "@/lib/firma/emails";
import { recordatorioPendiente } from "@/lib/firma/sobre";

// RECORDATORIOS DE FIRMA (lib/firma): en el tick diario (cron reconciliar-pagos), a los 2 y a los
// 5 días del envío, un correo al firmante que aún no ha firmado — como haría un prestatario de
// firma —, anotado en las pruebas y en el historial. Nunca después de caducar o anular.
const uuid = () => crypto.randomUUID();

export async function recordarFirmasPendientes(admin: SupabaseClient, ahora: Date = new Date()): Promise<{ recordados: number }> {
  const res = { recordados: 0 };
  const { data, error } = await admin.from("FirmaSobre").select("*").eq("estado", "PENDIENTE").not("enviadoAt", "is", null).limit(500);
  if (error || !data?.length) return res; // sin la tabla (migración pendiente) → nada
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
  for (const s of data as SobreFila[]) {
    if (!recordatorioPendiente(s, ahora)) continue;
    const r = await enviarSolicitudFirma(admin, s, { baseUrl, recordatorio: true, replyTo: await emailDeRespuesta(admin, s.workspaceId) });
    if (!r.enviado && !r.simulado) continue; // mañana se reintenta
    await evidencia(admin, s, { evento: "recordatorio", detalle: `A ${s.firmanteEmail} (automático)` }, { recordatorios: s.recordatorios + 1, ultimoRecordatorio: ahora.toISOString() });
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: s.expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: `✍️ Recordatorio de firma enviado a ${s.firmanteEmail}: ${s.documentos.map((d) => d.titulo).join(", ")}` });
    res.recordados += 1;
  }
  return res;
}
