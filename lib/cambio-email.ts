import crypto from "node:crypto";
import { CONTACTO } from "@/lib/contacto";

// Cambio del email de acceso (Ajustes › Despacho y cuenta). Sin tabla nueva: el enlace de
// confirmación lleva un token firmado (HMAC con clave derivada de la service role, como el
// state de Google Calendar) con el usuario, el email nuevo y la caducidad (1 h). Recibirlo en
// el buzón NUEVO prueba que es suyo; el cambio se aplica al pulsar «Confirmar» en la página
// (no al abrir el enlace: los escáneres de correo abren los enlaces solos).
//
// Auth (Supabase) y la tabla User llevan el mismo email: las pertenencias van por user.id,
// pero User.email es lo que ven el equipo, los avisos y el correo entrante (remitente =
// miembro). Por eso se cambian los dos, y si el segundo falla se deshace el primero.

export const VIDA_ENLACE_MS = 60 * 60 * 1000;

function clave(): string {
  const base = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!base) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return `${base}/cambio-email`;
}
const firmar = (cuerpo: string) => crypto.createHmac("sha256", clave()).update(cuerpo).digest();

export const normalizarEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
export const emailValido = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export function firmarCambio(userId: string, email: string, ahora = Date.now()): string {
  const cuerpo = Buffer.from(JSON.stringify({ u: userId, e: email, x: ahora + VIDA_ENLACE_MS })).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo).toString("base64url")}`;
}

export type CambioEmail = { userId: string; email: string; caduca: number };

// null si el token está manipulado, mal formado o caducado.
export function leerCambio(token: string, ahora = Date.now()): CambioEmail | null {
  const [cuerpo, firma, ...resto] = String(token ?? "").split(".");
  if (!cuerpo || !firma || resto.length) return null;
  const dada = Buffer.from(firma, "base64url"), esperada = firmar(cuerpo);
  if (dada.length !== esperada.length || !crypto.timingSafeEqual(dada, esperada)) return null;
  try {
    const p = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    if (typeof p.u !== "string" || typeof p.e !== "string" || typeof p.x !== "number") return null;
    if (p.x < ahora || !emailValido(p.e)) return null;
    return { userId: p.u, email: p.e, caduca: p.x };
  } catch {
    return null;
  }
}

// Solo para MOSTRAR el email nuevo en la página de confirmación (sin comprobar la firma:
// el cambio real pasa por leerCambio en el servidor).
export function emailDelToken(token: string): string | null {
  try {
    const e = JSON.parse(Buffer.from(String(token).split(".")[0] ?? "", "base64url").toString("utf8"))?.e;
    return typeof e === "string" && emailValido(e) ? e : null;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const marco = (cuerpo: string) => `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <p style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 16px">Aproba</p>${cuerpo}
</div>`;

export function htmlConfirmar(link: string, email: string): string {
  return marco(`
  <p style="font-size:15px;line-height:1.6;margin:0">Has pedido usar <strong>${esc(email)}</strong> como email de acceso a Aproba. Pulsa el botón para confirmarlo. Tu contraseña no cambia.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#0E8C5F;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block">Confirmar mi nuevo email</a></p>
  <p style="font-size:12px;color:#94a3b8;margin:0">El enlace caduca en 1 hora. Si no has pedido este cambio, ignora este correo: tu cuenta sigue igual. Si el botón no funciona, copia esta dirección en tu navegador:<br>${link}</p>`);
}

export function htmlAviso(nuevo: string): string {
  return marco(`
  <p style="font-size:15px;line-height:1.6;margin:0">El email de acceso de tu cuenta de Aproba ha cambiado a <strong>${esc(nuevo)}</strong>. A partir de ahora entras con esa dirección; tu contraseña no cambia.</p>
  <p style="font-size:15px;line-height:1.6;margin:16px 0 0">Si no has sido tú, escríbenos cuanto antes a <a href="mailto:${CONTACTO.email}" style="color:#0E8C5F">${CONTACTO.email}</a>.</p>`);
}

// Aplica un cambio ya verificado. Las dependencias se inyectan (la ruta usa Supabase admin y
// Stripe; los tests, dobles en memoria).
export type DepsCambio = {
  leerUsuario: (id: string) => Promise<{ email: string } | null>;
  emailEnUso: (email: string, exceptoId: string) => Promise<boolean>;
  cambiarEmailAuth: (id: string, email: string) => Promise<string | null>;   // mensaje de error o null
  cambiarEmailTabla: (id: string, email: string) => Promise<string | null>;
  sincronizarStripe?: (id: string, anterior: string, nuevo: string) => Promise<void>;
  avisarAnterior?: (anterior: string, nuevo: string) => Promise<void>;
};
export type ResultadoCambio =
  | { ok: true; email: string; anterior: string; yaAplicado?: boolean }
  | { ok: false; codigo: "no_encontrado" | "en_uso" | "error"; status: number };

export async function aplicarCambioEmail(c: CambioEmail, d: DepsCambio): Promise<ResultadoCambio> {
  const u = await d.leerUsuario(c.userId);
  if (!u) return { ok: false, codigo: "no_encontrado", status: 404 };
  const anterior = normalizarEmail(u.email);
  if (anterior === c.email) return { ok: true, email: c.email, anterior, yaAplicado: true };   // segundo clic
  if (await d.emailEnUso(c.email, c.userId)) return { ok: false, codigo: "en_uso", status: 409 };
  const errAuth = await d.cambiarEmailAuth(c.userId, c.email);
  if (errAuth) return { ok: false, codigo: /already|registered|exists|duplicate/i.test(errAuth) ? "en_uso" : "error", status: 409 };
  const errTabla = await d.cambiarEmailTabla(c.userId, c.email);
  if (errTabla) {
    await d.cambiarEmailAuth(c.userId, anterior);   // deshacer: Auth y User nunca quedan distintos
    return { ok: false, codigo: /duplicate|unique/i.test(errTabla) ? "en_uso" : "error", status: 409 };
  }
  try { await d.sincronizarStripe?.(c.userId, anterior, c.email); } catch { /* best-effort: el acceso ya ha cambiado */ }
  try { await d.avisarAnterior?.(anterior, c.email); } catch { /* best-effort */ }
  return { ok: true, email: c.email, anterior };
}
