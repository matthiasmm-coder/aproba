import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telefonoE164 } from "@/lib/whatsapp-util";

// WHATSAPP DEL DESPACHO — Meta Cloud API en directo (sin Twilio), opción B (11/09/2026):
// cada despacho conecta SU número (Embedded Signup + coexistencia con la app WhatsApp
// Business). Este módulo es el ÚNICO que habla con graph.facebook.com: custodia del token,
// envío, descarga de media, firma de webhooks, alta/baja de la cuenta.
//
// Env (Aproba como Tech Provider de Meta):
//   META_APP_ID, META_APP_SECRET           — la app de Meta de Aproba (firma de webhooks, canje del código)
//   META_WEBHOOK_VERIFY_TOKEN              — verificación del webhook (GET hub.challenge)
//   META_GRAPH_VERSION (opcional)          — por defecto v25.0
//   NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_ES_CONFIG_ID — botón «Conectar mi WhatsApp» (Embedded Signup v4)
// Sin META_APP_SECRET no hay WhatsApp del despacho: todo cae al comportamiento anterior.

export const GRAPH_VERSION = (process.env.META_GRAPH_VERSION ?? "v25.0").trim();
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const metaDisponible = () => Boolean((process.env.META_APP_SECRET ?? "").trim() && (process.env.META_APP_ID ?? "").trim());

// ── Custodia del token (misma mecánica que la clave Stripe del despacho: AES-256-GCM
//    con clave derivada del service_role — quien lo tenga ya tiene acceso a todo). ──
const encKey = (): Buffer | null => {
  const seed = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return seed ? crypto.scryptSync(seed, "aproba/whatsapp-cuenta/v1", 32) : null;
};
export function cifrarToken(plain: string): string {
  const k = encKey();
  if (!k) throw new Error("Cifrado no disponible (falta SUPABASE_SERVICE_ROLE_KEY).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function descifrarToken(enc: string): string | null {
  const k = encKey();
  if (!k) return null;
  try {
    const raw = Buffer.from(enc, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; }
}

// ── Firma de los webhooks: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(cuerpo crudo, app secret). ──
export function firmaValida(rawBody: string, header: string | null): boolean {
  const secret = (process.env.META_APP_SECRET ?? "").trim();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const esperado = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const dado = header.slice(7);
  return dado.length === esperado.length && crypto.timingSafeEqual(Buffer.from(dado, "hex"), Buffer.from(esperado, "hex"));
}

// ── Cuenta del despacho ──────────────────────────────────────────────────────
export type CuentaWA = {
  id: string; workspaceId: string; oficinaId: string | null; wabaId: string; phoneNumberId: string;
  telefono: string | null; nombreVerificado: string | null; token: string; coexistencia: boolean; estado: string; plantillas: Record<string, string>;
};
type Fila = { id: string; workspaceId: string; oficinaId: string | null; wabaId: string; phoneNumberId: string; telefono: string | null; nombreVerificado: string | null; tokenCifrado: string; coexistencia: boolean; estado: string; plantillas: Record<string, string> | null };
const deFila = (f: Fila): CuentaWA | null => {
  const token = descifrarToken(f.tokenCifrado);
  return token ? { ...f, token, plantillas: f.plantillas ?? {} } : null;
};
const SEL = "id, workspaceId, oficinaId, wabaId, phoneNumberId, telefono, nombreVerificado, tokenCifrado, coexistencia, estado, plantillas";

export async function cuentaPorPhoneNumberId(admin: SupabaseClient, phoneNumberId: string): Promise<CuentaWA | null> {
  try {
    const { data } = await admin.from("WhatsAppCuenta").select(SEL).eq("phoneNumberId", phoneNumberId).eq("estado", "CONECTADA").maybeSingle();
    return data ? deFila(data as Fila) : null;
  } catch { return null; }
}
// Cuenta que envía para un despacho (+ sede preferida): la de la sede, si no la del despacho.
export async function cuentaDelWorkspace(admin: SupabaseClient, workspaceId: string, oficinaId: string | null = null): Promise<CuentaWA | null> {
  try {
    const { data } = await admin.from("WhatsAppCuenta").select(SEL).eq("workspaceId", workspaceId).eq("estado", "CONECTADA");
    const filas = (data ?? []) as Fila[];
    const f = (oficinaId && filas.find((x) => x.oficinaId === oficinaId)) || filas.find((x) => !x.oficinaId) || filas[0];
    return f ? deFila(f) : null;
  } catch { return null; }
}

// ── Graph API ────────────────────────────────────────────────────────────────
async function graph<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!res.ok || json.error) throw new Error(`Meta ${res.status}: ${json.error?.message ?? "error"}${json.error?.code ? ` (code ${json.error.code}${json.error.error_subcode ? `/${json.error.error_subcode}` : ""})` : ""}`);
  return json;
}

// Canje del código del Embedded Signup (TTL 30 s) por el token de sistema del negocio.
export async function canjearCodigo(code: string): Promise<{ token: string; expiraEn: number | null }> {
  const q = new URLSearchParams({ client_id: (process.env.META_APP_ID ?? "").trim(), client_secret: (process.env.META_APP_SECRET ?? "").trim(), code });
  const res = await fetch(`${GRAPH}/oauth/access_token?${q}`);
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !j.access_token) throw new Error(`Meta canje: ${j.error?.message ?? res.status}`);
  return { token: j.access_token, expiraEn: typeof j.expires_in === "number" ? j.expires_in : null };
}
// La app de Aproba se suscribe a los webhooks del WABA del despacho.
export const suscribirApp = (token: string, wabaId: string) => graph<{ success: boolean }>(token, `/${wabaId}/subscribed_apps`, { method: "POST" });
export type TelefonoWaba = { id: string; display_phone_number: string; verified_name?: string; platform_type?: string; is_on_biz_app?: boolean; quality_rating?: string };
export const telefonosDelWaba = async (token: string, wabaId: string) =>
  (await graph<{ data: TelefonoWaba[] }>(token, `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,is_on_biz_app,quality_rating`)).data ?? [];
// Coexistencia: sincronización única de contactos y de historial (ventana de 24 h tras el alta).
export const sincronizar = (token: string, phoneNumberId: string, tipo: "smb_app_state_sync" | "history") =>
  graph<{ request_id?: string; messaging_product?: string }>(token, `/${phoneNumberId}/smb_app_data`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", sync_type: tipo }) });

// ── Envío ────────────────────────────────────────────────────────────────────
export type EnvioWA = { id: string };
const destino = (telefono: string) => { const to = telefonoE164(telefono); if (!to) throw new Error("Teléfono no utilizable"); return to.replace(/^\+/, ""); };
export async function enviarTexto(cuenta: CuentaWA, telefono: string, body: string, opts: { previewUrl?: boolean; responderA?: string | null } = {}): Promise<EnvioWA> {
  const r = await graph<{ messages?: { id: string }[] }>(cuenta.token, `/${cuenta.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destino(telefono), type: "text", text: { preview_url: Boolean(opts.previewUrl), body: body.slice(0, 4096) }, ...(opts.responderA ? { context: { message_id: opts.responderA } } : {}) }),
  });
  return { id: r.messages?.[0]?.id ?? "" };
}
export async function enviarPlantilla(cuenta: CuentaWA, telefono: string, nombre: string, idioma: string, parametros: string[]): Promise<EnvioWA> {
  const r = await graph<{ messages?: { id: string }[] }>(cuenta.token, `/${cuenta.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: destino(telefono), type: "template",
      template: { name: nombre, language: { code: idioma }, components: parametros.length ? [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) }] : [] },
    }),
  });
  return { id: r.messages?.[0]?.id ?? "" };
}
// Marcar como leído (el cliente ve los dos ticks azules aunque el gestor no haya abierto el hilo).
export const marcarLeido = (cuenta: CuentaWA, wamid: string) =>
  graph<{ success: boolean }>(cuenta.token, `/${cuenta.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }) }).catch(() => null);

// ── Media ────────────────────────────────────────────────────────────────────
// Dos pasos: GET /{media_id} → url temporal (5 min) → GET url con el token.
export async function descargarMedia(cuenta: CuentaWA, mediaId: string): Promise<{ buffer: Buffer; mime: string; size: number }> {
  const meta = await graph<{ url: string; mime_type: string; file_size?: number }>(cuenta.token, `/${mediaId}?phone_number_id=${cuenta.phoneNumberId}`);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${cuenta.token}`, "User-Agent": "Aproba/1.0 (+https://aproba-software.com)" } });
  if (!res.ok) throw new Error(`Meta media ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime: meta.mime_type || res.headers.get("content-type") || "application/octet-stream", size: buffer.length };
}

// ── Plantillas del WABA ──────────────────────────────────────────────────────
export type PlantillaDef = { name: string; language: string; category: "UTILITY" | "MARKETING" | "AUTHENTICATION"; body: string; ejemplo: string[] };
export async function crearPlantilla(token: string, wabaId: string, p: PlantillaDef): Promise<{ id?: string; status?: string }> {
  return graph(token, `/${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: p.name, language: p.language, category: p.category, components: [{ type: "BODY", text: p.body, example: { body_text: [p.ejemplo] } }] }),
  });
}
export async function estadoPlantillas(token: string, wabaId: string): Promise<Record<string, string>> {
  const r = await graph<{ data?: { name: string; status: string; language: string }[] }>(token, `/${wabaId}/message_templates?fields=name,status,language&limit=100`);
  const out: Record<string, string> = {};
  for (const t of r.data ?? []) out[`${t.name}:${t.language}`] = t.status;
  return out;
}
