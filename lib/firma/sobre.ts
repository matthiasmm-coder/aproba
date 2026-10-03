import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { CajaFirma } from "@/lib/encargo";

// FIRMA ELECTRÓNICA EN LÍNEA (Jennifer, 03/10/2026; Matthias: «tan bien como un Signaturit,
// salvo el peso jurídico»). Un SOBRE = los documentos que UNA persona firma de una vez: revisa
// el PDF exacto (guardado, con su huella SHA-256), firma una sola vez (la firma va a la casilla
// de cada documento), confirma con un código de un solo uso enviado a su email, y queda un
// rastro de pruebas (envío, apertura, código, firma, IP, dispositivo). Módulo PURO: reglas y
// utilidades; el PDF vive en lib/firma/pdf.ts y la orquestación en lib/firma/servicio.ts.

export type DocFirmable = "hoja" | "mandato" | "presupuesto";
export const DOCS_FIRMABLES: readonly DocFirmable[] = ["hoja", "mandato", "presupuesto"];
export const esDocFirmable = (x: unknown): x is DocFirmable => typeof x === "string" && (DOCS_FIRMABLES as readonly string[]).includes(x);

export const TITULO_DOC: Record<DocFirmable, string> = {
  hoja: "Hoja de encargo",
  mandato: "Mandato de representación",
  presupuesto: "Presupuesto",
};
// La pieza que queda en el expediente al firmar: las mismas etiquetas que las casillas
// «firmadas» del portal (así el portal y la ficha las dan por entregadas). El presupuesto no
// tiene tipo propio en la base: pieza OTRO con su nombre.
export const PIEZA_FIRMADA: Record<DocFirmable, { tipo: string; etiqueta: string }> = {
  hoja: { tipo: "HOJA_ENCARGO", etiqueta: "Hoja de encargo firmada" },
  mandato: { tipo: "MANDATO", etiqueta: "Mandato de representación firmado" },
  presupuesto: { tipo: "OTRO", etiqueta: "Presupuesto aceptado (firmado)" },
};

export type DocSobre = {
  doc: DocFirmable; titulo: string;
  path: string; hash: string; paginas: number; cajas: CajaFirma[];   // el original revisado
  firmadoPath?: string; firmadoHash?: string; documentoId?: string;  // tras la firma
};
export type EventoFirma = "creado" | "enviado" | "abierto" | "codigo_enviado" | "codigo_fallido" | "codigo_ok" | "firmado" | "recordatorio" | "anulado";
export type EvidenciaFirma = { evento: EventoFirma; en: string; ip?: string | null; dispositivo?: string | null; detalle?: string };
export type EstadoSobre = "PENDIENTE" | "FIRMADO" | "ANULADO";
export type MetodoFirma = "dibujada" | "escrita";

export const OTP_MINUTOS = 10;       // validez del código
export const OTP_MAX_INTENTOS = 5;   // códigos erróneos antes de pedir uno nuevo
export const OTP_MAX_ENVIOS = 6;     // códigos por sobre (evita usar el formulario para mandar correos)
export const OTP_REENVIO_SEG = 30;   // espera mínima entre dos envíos
export const SOBRE_DIAS = 30;        // vida de un enlace de firma
export const RECORDATORIOS_DIAS = [2, 5] as const; // días tras el envío en que se recuerda al cliente

// Enlace de firma: 24 bytes aleatorios (192 bits), en base64url.
export const nuevoToken = () => randomBytes(24).toString("base64url");
export const nuevoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// El código NUNCA se guarda en claro, y su huella lleva un secreto del servidor que no está en
// la base: con 6 cifras, una huella simple se rompería en segundos por quien pueda leer la fila
// (el despacho la lee bajo RLS), y podría firmar por el cliente.
export function huellaCodigo(codigo: string, sobreId: string, secreto: string): string {
  const clave = createHash("sha256").update(`aproba-firma-otp:${secreto}`).digest();
  return createHmac("sha256", clave).update(`${sobreId}:${codigo.trim()}`).digest("hex");
}
export function codigoCoincide(codigo: string, sobreId: string, huella: string | null | undefined, secreto: string): boolean {
  if (!huella || !/^\d{6}$/.test(codigo.trim())) return false;
  const a = Buffer.from(huellaCodigo(codigo, sobreId, secreto), "hex");
  const b = Buffer.from(huella, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// «juan.perez@gmail.com» → «j***z@gmail.com»: el cliente reconoce su buzón sin exponerlo.
export function enmascararEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const [user, dom] = e.split("@");
  if (!user || !dom) return "";
  return user.length <= 2 ? `${user[0]}***@${dom}` : `${user[0]}***${user[user.length - 1]}@${dom}`;
}

// «Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 …) … Safari/604.1» → «iPhone · Safari»: lo que
// el certificado de firma dice del dispositivo, legible para una persona.
export function resumenDispositivo(ua: string | null | undefined): string {
  const u = ua ?? "";
  if (!u) return "Desconocido";
  const so = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows"
    : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Otro sistema";
  const nav = /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung Internet"
    : /CriOS|Chrome\//.test(u) ? "Chrome" : /FxiOS|Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "otro navegador";
  return `${so} · ${nav}`;
}

// IP del cliente detrás del proxy de Vercel: la primera de x-forwarded-for.
export function ipDe(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip")?.trim() || null;
}

// Lo que enseña la ficha del expediente: el hecho más reciente.
export type EstadoVisibleSobre = "pendiente" | "abierto" | "firmado" | "anulado" | "caducado";
export function estadoVisibleSobre(s: { estado: string; abiertoAt?: string | null; expiraAt?: string | null }, ahora: Date = new Date()): EstadoVisibleSobre {
  if (s.estado === "FIRMADO") return "firmado";
  if (s.estado === "ANULADO") return "anulado";
  if (s.expiraAt && Date.parse(s.expiraAt) < ahora.getTime()) return "caducado";
  return s.abiertoAt ? "abierto" : "pendiente";
}

// ¿Toca recordar hoy al cliente? A los 2 y a los 5 días del envío, una vez cada uno.
export function recordatorioPendiente(s: { estado: string; enviadoAt?: string | null; recordatorios: number; expiraAt?: string | null }, ahora: Date = new Date()): boolean {
  if (s.estado !== "PENDIENTE" || !s.enviadoAt) return false;
  if (s.expiraAt && Date.parse(s.expiraAt) < ahora.getTime()) return false;
  const dias = Math.floor((ahora.getTime() - Date.parse(s.enviadoAt)) / 86_400_000);
  const toca = RECORDATORIOS_DIAS.filter((d) => dias >= d).length;
  return toca > s.recordatorios;
}

// La imagen de la firma llega como data URL PNG del lienzo: se valida antes de tocar el PDF.
export function pngDeDataUrl(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  // Firma razonable: más de 200 bytes (un lienzo vacío pesa menos) y menos de 1,5 MB.
  if (buf.length < 200 || buf.length > 1_500_000) return null;
  // Cabecera PNG.
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return null;
  return new Uint8Array(buf);
}

// Fecha y hora de Madrid para el certificado y el pie de página («03/10/2026 19:45»).
export function fechaHoraMadrid(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

export const ETIQUETA_EVENTO: Record<EventoFirma, string> = {
  creado: "Documentos preparados para la firma",
  enviado: "Enlace de firma enviado al firmante",
  abierto: "El firmante abrió los documentos",
  codigo_enviado: "Código de un solo uso enviado al email del firmante",
  codigo_fallido: "Código introducido incorrecto",
  codigo_ok: "Código verificado: email del firmante confirmado",
  firmado: "Documentos firmados",
  recordatorio: "Recordatorio enviado al firmante",
  anulado: "Envío anulado por el despacho",
};
