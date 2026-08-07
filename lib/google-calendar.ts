import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Integración Google Calendar/Meet por WORKSPACE («OAuth por gestor»): la gestoría
// conecta UNA vez su cuenta de Google desde Ajustes; después, al guardar una cita
// en modo automático, Aproba crea el evento en su calendario con enlace de Meet
// (conferenceData) y lo mantiene: cambia la hora → se actualiza; se borra la cita
// → se borra el evento (todo best-effort: Google nunca bloquea el guardado local).
//
// Credencial = refresh_token, cifrado AES-256-GCM (misma receta que cobros-tarjeta:
// clave derivada del SUPABASE_SERVICE_ROLE_KEY) en la tabla deny-all
// GoogleCalendarCuenta (supabase/google-calendar.sql).
//
// Variables de entorno necesarias (sin ellas la integración se muestra como «no
// configurada» y el modo manual sigue intacto):
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
// URI de redirección a registrar en Google Cloud (exacta):
//   https://aproba-software.com/api/integraciones/google/callback

const SCOPE = "https://www.googleapis.com/auth/calendar.events";

// SIEMPRE con trim(): al pegar las credenciales en el panel de Vercel se cuela un
// salto de línea con facilidad, y Google responde «invalid_client — The OAuth client
// was not found» (pasó el 07/08/2026), un error que no apunta para nada a su causa.
const clientId = () => (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
const clientSecret = () => (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();

export const googleOAuthDisponible = () => Boolean(clientId() && clientSecret());

// ── Cifrado credencial (idéntico a lib/cobros-tarjeta.ts, sal propia) ────────────
const encKey = (): Buffer | null => {
  const seed = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!seed) return null;
  return crypto.scryptSync(seed, "aproba/google-calendar/v1", 32);
};

export function cifrarCredencial(refreshToken: string): string {
  const k = encKey();
  if (!k) throw new Error("Cifrado no disponible (falta SUPABASE_SERVICE_ROLE_KEY).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(JSON.stringify({ refresh_token: refreshToken }), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function descifrarCredencial(enc: string): { refresh_token: string } | null {
  const k = encKey();
  if (!k) return null;
  try {
    const raw = Buffer.from(enc, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const j = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
    return typeof j?.refresh_token === "string" ? j : null;
  } catch {
    return null;
  }
}

// ── State anti-CSRF del flujo OAuth (HMAC firmado, 10 min de validez) ────────────
const hmac = (msg: string) =>
  crypto.createHmac("sha256", (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "aproba") + "/google-oauth")
    .update(msg).digest("base64url");

export function firmarState(workspaceId: string): string {
  const cuerpo = `${workspaceId}.${Date.now()}`;
  return Buffer.from(`${cuerpo}.${hmac(cuerpo)}`).toString("base64url");
}

export function verificarState(state: string): string | null {
  try {
    const [ws, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!ws || !ts || !sig) return null;
    if (hmac(`${ws}.${ts}`) !== sig) return null;
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null; // caducado
    return ws;
  } catch {
    return null;
  }
}

export function urlConexionGoogle(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // fuerza refresh_token también en reconexiones
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function intercambiarCodigo(code: string, redirectUri: string): Promise<{ refreshToken: string } | { error: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.refresh_token) return { error: String(d.error_description ?? d.error ?? "Sin refresh_token en la respuesta de Google.") };
  return { refreshToken: d.refresh_token as string };
}

async function accessTokenDe(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const d = await res.json().catch(() => ({}));
  return res.ok && d.access_token ? (d.access_token as string) : null;
}

export async function revocarCredencial(credencialEnc: string): Promise<void> {
  const cred = descifrarCredencial(credencialEnc);
  if (!cred) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: cred.refresh_token }),
  }).catch(() => { /* best-effort */ });
}

// Estado REAL de la conexión: no basta con que exista la credencial — en modo Testing
// de Google los refresh tokens mueren a los 7 días, y el gestor también puede revocar
// el acceso desde su cuenta. Sin esta prueba, Ajustes diría «Conectado» sobre una
// conexión muerta y el fallo aparecería al guardar una cita. Cuesta una llamada al
// endpoint de token (no consume cuota de Calendar).
export async function probarConexion(admin: SupabaseClient, workspaceId: string): Promise<"ok" | "caducada" | "sin_conexion"> {
  const enc = await credencialDeWorkspace(admin, workspaceId);
  if (!enc) return "sin_conexion";
  const cred = descifrarCredencial(enc);
  if (!cred) return "caducada"; // ilegible (¿se rotó el service_role?) → hay que reconectar
  return (await accessTokenDe(cred.refresh_token)) ? "ok" : "caducada";
}

// Credencial activa del workspace (o null: sin migrar / sin conectar / indescifrable).
export async function credencialDeWorkspace(admin: SupabaseClient, workspaceId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("GoogleCalendarCuenta").select("credencialEnc, activa").eq("workspaceId", workspaceId).maybeSingle();
    if (!data?.activa || !data?.credencialEnc) return null;
    return data.credencialEnc as string;
  } catch {
    return null;
  }
}

// ── Google Calendar API ──────────────────────────────────────────────────────────
const horaFinDe = (hora: string, duracion: number) => {
  const [h, m] = hora.split(":").map(Number);
  const tot = h * 60 + m + duracion;
  return { dias: Math.floor(tot / 1440), hhmm: `${String(Math.floor((tot % 1440) / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}` };
};
const sumarDias = (fecha: string, n: number) => {
  if (!n) return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const cuerpoEvento = (o: { titulo: string; fecha: string; hora: string; duracion: number }) => {
  const fin = horaFinDe(o.hora, o.duracion);
  return {
    summary: o.titulo,
    start: { dateTime: `${o.fecha}T${o.hora}:00`, timeZone: "Europe/Madrid" },
    end: { dateTime: `${sumarDias(o.fecha, fin.dias)}T${fin.hhmm}:00`, timeZone: "Europe/Madrid" },
  };
};

// Crea el evento con sala de Meet en el calendario primario del gestor.
export async function crearReunionMeet(
  admin: SupabaseClient,
  workspaceId: string,
  o: { titulo: string; fecha: string; hora: string; duracion: number },
): Promise<{ enlace: string; eventoId: string } | { error: string }> {
  if (!googleOAuthDisponible()) return { error: "La integración con Google no está configurada." };
  const enc = await credencialDeWorkspace(admin, workspaceId);
  if (!enc) return { error: "Google no está conectado en Ajustes." };
  const cred = descifrarCredencial(enc);
  if (!cred) return { error: "La credencial de Google no se pudo leer. Vuelve a conectar Google en Ajustes." };
  const token = await accessTokenDe(cred.refresh_token);
  if (!token) return { error: "Google rechazó la conexión (¿acceso revocado?). Vuelve a conectar Google en Ajustes o pega el enlace manualmente." };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...cuerpoEvento(o),
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Google Calendar respondió ${res.status}. Pega el enlace manualmente o reintenta.` };
  const enlace: string | undefined = d.hangoutLink
    ?? d.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === "video")?.uri;
  if (!enlace || !d.id) return { error: "Google no devolvió el enlace de Meet. Pega el enlace manualmente." };
  return { enlace, eventoId: d.id as string };
}

// Reprograma el evento (cambio de fecha/hora/duración). Best-effort.
export async function actualizarReunionMeet(
  admin: SupabaseClient,
  workspaceId: string,
  eventoId: string,
  o: { titulo: string; fecha: string; hora: string; duracion: number },
): Promise<void> {
  try {
    const enc = await credencialDeWorkspace(admin, workspaceId);
    const cred = enc ? descifrarCredencial(enc) : null;
    const token = cred ? await accessTokenDe(cred.refresh_token) : null;
    if (!token) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventoId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoEvento(o)),
    });
  } catch { /* best-effort */ }
}

// Borra el evento del calendario del gestor (cita eliminada o pasada a manual). Best-effort.
export async function borrarReunionMeet(admin: SupabaseClient, workspaceId: string, eventoId: string): Promise<void> {
  try {
    const enc = await credencialDeWorkspace(admin, workspaceId);
    const cred = enc ? descifrarCredencial(enc) : null;
    const token = cred ? await accessTokenDe(cred.refresh_token) : null;
    if (!token) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventoId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* best-effort */ }
}
