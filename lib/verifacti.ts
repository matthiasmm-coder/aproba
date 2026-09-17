import "server-only";

// Cliente HTTP de Verifacti (https://www.verifacti.com/docs). La clave de EMPRESA (una por
// NIF emisor y entorno) va en `Authorization: Bearer`; el propio Verifacti decide con ella
// el NIF y si es test o producción. Timeout corto: la emisión de una factura nunca espera
// más de 20 s por la AEAT — si falla, el registro queda ERROR_ENVIO y se reintenta.

const BASE = () => (process.env.VERIFACTI_BASE_URL ?? "https://api.verifacti.com").replace(/\/$/, "");
const TIMEOUT_MS = 20_000;

export type RespuestaVerifacti<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; codigo?: string; data?: unknown };

async function llamar<T>(apiKey: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown, extra?: Record<string, string>): Promise<RespuestaVerifacti<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(extra ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const texto = await res.text();
    let data: unknown = null;
    try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
    if (!res.ok) {
      const d = (data && typeof data === "object" ? data : {}) as { error?: unknown; message?: unknown; codigo?: unknown };
      const error = [d.error, d.message].filter((x) => typeof x === "string" && x).join(" — ") || (typeof data === "string" && data ? data.slice(0, 300) : `HTTP ${res.status}`);
      return { ok: false, status: res.status, error, ...(typeof d.codigo === "string" ? { codigo: d.codigo } : {}), data };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Verifacti no respondió en 20 s." : e.message) : String(e);
    return { ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export type CreadoVerifacti = { uuid: string; estado: string; url?: string; qr?: string; huella?: string };
export type EstadoVerifacti = {
  nif?: string; serie?: string; numero?: string; fecha_expedicion?: string; operacion?: string; estado?: string;
  url?: string; qr?: string; codigo_error?: string; mensaje_error?: string; estado_registro_duplicado?: string;
};
export type SaludVerifacti = { estado?: string; nif?: string; entorno?: string };
export type DeclaracionVerifacti = { url?: string; url_version?: string; sistema_informatico?: { nombre?: string; id?: string; version?: string } };

export const verifacti = {
  crear: (apiKey: string, payload: unknown, idempotencia: string) =>
    llamar<CreadoVerifacti>(apiKey, "POST", "/verifactu/create", payload, { "Idempotency-Key": idempotencia }),
  anular: (apiKey: string, payload: unknown, idempotencia: string) =>
    llamar<CreadoVerifacti>(apiKey, "POST", "/verifactu/cancel", payload, { "Idempotency-Key": idempotencia }),
  estado: (apiKey: string, uuid: string) =>
    llamar<EstadoVerifacti>(apiKey, "GET", `/verifactu/status?uuid=${encodeURIComponent(uuid)}`),
  salud: (apiKey: string) => llamar<SaludVerifacti>(apiKey, "GET", "/verifactu/health"),
  declaracion: (apiKey: string) => llamar<DeclaracionVerifacti>(apiKey, "GET", "/verifactu/declaracion"),
};

// ¿El 400 de Verifacti es «destinatario no censado / nombre no coincide»? → se reintenta
// identificando al cliente como IDOtro tipo 07 (No censado), que la AEAT sí admite.
export function esErrorCenso(r: { error?: string; codigo?: string }): boolean {
  const t = `${r.codigo ?? ""} ${r.error ?? ""}`.toLowerCase();
  return /cens|no identificado|nombre.*(coincid|parecid)|vies/.test(t);
}
