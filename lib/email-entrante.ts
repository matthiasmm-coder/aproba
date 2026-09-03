// RECEPCIÓN DE DOCUMENTOS POR EMAIL (03/09/2026) — parte PURA, sin servidor ni red.
//
// Cada despacho tiene una dirección propia (docs-<token>@in.aproba-software.com).
// El gestor reenvía el email del cliente (o el cliente escribe directamente) y Aproba:
//   1. reconoce al despacho por el token de la dirección,
//   2. intenta reconocer al CLIENTE por las pistas del mensaje (email, teléfono,
//      número de documento, nombre completo),
//   3. guarda los adjuntos en la ficha/expediente del cliente — o en la «Bandeja»
//      si no está claro de quién son.
// Todo lo que se pueda probar sin red vive aquí (ver lib/email-entrante.test.ts);
// la parte con Resend + Supabase está en lib/email-entrante-procesar.ts.

import { telefonoE164 } from "@/lib/whatsapp";

export const PREFIJO_DIRECCION = "docs-";

export function dominioEntrante(): string {
  return (process.env.EMAIL_ENTRANTE_DOMINIO || "in.aproba-software.com").toLowerCase();
}

export function direccionEntrante(token: string): string {
  return `${PREFIJO_DIRECCION}${token}@${dominioEntrante()}`;
}

export function generarTokenEntrante(): string {
  // 10 caracteres [a-z0-9]: legible en una dirección de email y con espacio de sobra.
  const alfabeto = "abcdefghijkmnpqrstuvwxyz23456789"; // sin l/o/0/1 (ambiguos al dictar)
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

// «Nombre <docs-abc@in.aproba-software.com>» o la dirección a secas → token, o null.
export function tokenDeDireccion(direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  const m = direccion.toLowerCase().match(/docs-([a-z0-9]{6,32})@([a-z0-9.-]+)/);
  if (!m) return null;
  return m[2] === dominioEntrante() ? m[1] : null;
}

// El token puede venir en `to`, en `cc` o (reenvío automático) en `received_for`.
export function tokenDeDestinatarios(listas: (string[] | null | undefined)[]): string | null {
  for (const lista of listas) for (const d of lista ?? []) { const t = tokenDeDireccion(d); if (t) return t; }
  return null;
}

export function direccionDe(remitente: string | null | undefined): string {
  const m = (remitente ?? "").match(/<([^>]+)>/);
  return (m ? m[1] : remitente ?? "").trim().toLowerCase();
}

export function nombreDe(remitente: string | null | undefined): string | null {
  const m = (remitente ?? "").match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  return m ? m[1].trim() : null;
}

// Cuerpo utilizable: texto plano si lo hay, si no el HTML sin etiquetas. Acotado.
export function limpiarCuerpo(text: string | null | undefined, html: string | null | undefined, max = 20_000): string {
  let s = (text && text.trim()) ? text : (html ?? "")
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+.\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizarDocumento(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[\s\-./]/g, "");
}

export type Pistas = { emails: string[]; telefonos: string[]; documentos: string[]; texto: string };

// Pistas de identidad presentes en un texto (asunto + cuerpo + nombres de adjuntos).
export function extraerPistas(texto: string, excluirEmails: Iterable<string> = []): Pistas {
  const excl = new Set(Array.from(excluirEmails, (e) => e.toLowerCase()));
  const emails = uniq((texto.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))
    .filter((e) => !excl.has(e) && !tokenDeDireccion(e));
  // Teléfonos: secuencias de 9-15 dígitos con separadores, con o sin prefijo.
  const telefonos = uniq((texto.match(/(?:\+|00)?\d[\d\s().-]{7,18}\d/g) ?? [])
    .map((t) => telefonoE164(t))
    .filter((t): t is string => Boolean(t)));
  // NIE (X/Y/Z + 7 cifras + letra), DNI (8 cifras + letra) y pasaportes alfanuméricos de 6-9.
  const documentos = uniq((texto.toUpperCase().match(/\b(?:[XYZ][\s-]?\d{7}[\s-]?[A-Z]|\d{8}[\s-]?[A-Z]|[A-Z]{1,3}\d{6,8}|[A-Z]{2}\d{6,7}[A-Z]?)\b/g) ?? [])
    .map(normalizarDocumento));
  return { emails, telefonos, documentos, texto };
}

export type ClienteCandidato = {
  id: string; nombre: string; apellidos: string | null; email: string | null; telefono: string | null; numeroDocumento: string | null;
};

export type Emparejamiento = { cliente: ClienteCandidato | null; motivo: string; candidatos: string[] };

// Reconocimiento del cliente. Cada regla solo decide si señala EXACTAMENTE a un cliente;
// si señala a varios, el resultado es «ambiguo» y el email va a la bandeja: antes
// preguntar que equivocarse de carpeta.
export function emparejarCliente(clientes: ClienteCandidato[], pistas: Pistas): Emparejamiento {
  const unico = (lista: ClienteCandidato[], motivo: string): Emparejamiento | null => {
    const ids = uniq(lista.map((c) => c.id));
    if (ids.length === 1) return { cliente: lista[0], motivo, candidatos: ids };
    if (ids.length > 1) return { cliente: null, motivo: `ambiguo: ${motivo}`, candidatos: ids };
    return null;
  };
  // 1. Email exacto.
  if (pistas.emails.length) {
    const set = new Set(pistas.emails);
    const r = unico(clientes.filter((c) => c.email && set.has(c.email.toLowerCase().trim())), "email");
    if (r) return r;
  }
  // 2. Número de documento (NIE/DNI/pasaporte).
  if (pistas.documentos.length) {
    const set = new Set(pistas.documentos);
    const r = unico(clientes.filter((c) => c.numeroDocumento && set.has(normalizarDocumento(c.numeroDocumento))), "documento");
    if (r) return r;
  }
  // 3. Teléfono en E.164.
  if (pistas.telefonos.length) {
    const set = new Set(pistas.telefonos);
    const r = unico(clientes.filter((c) => { const t = telefonoE164(c.telefono); return t ? set.has(t) : false; }), "teléfono");
    if (r) return r;
  }
  // 4. Nombre completo (nombre + apellidos, sin acentos) presente en el texto.
  const texto = ` ${normalizarTexto(pistas.texto)} `;
  if (texto.trim()) {
    const porNombre = clientes.filter((c) => {
      const completo = normalizarTexto(`${c.nombre} ${c.apellidos ?? ""}`);
      // Un nombre solo (sin apellidos) es demasiado común para decidir.
      return completo.includes(" ") && completo.length >= 8 && texto.includes(` ${completo} `);
    });
    const r = unico(porNombre, "nombre");
    if (r) return r;
  }
  return { cliente: null, motivo: "sin coincidencia", candidatos: [] };
}

export const ADJUNTOS_ADMITIDOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const ADJUNTO_MAX_BYTES = 8 * 1024 * 1024;

export type AdjuntoMeta = { filename: string | null; content_type: string; size: number; content_disposition?: string | null; content_id?: string | null };

// Qué adjuntos merecen entrar: PDF e imágenes hasta 8 MB. Las imágenes «inline» pequeñas
// con content-id son los logos de las firmas de email, no documentos.
export function extensionAdmitida(a: AdjuntoMeta): string | null {
  const porTipo = ADJUNTOS_ADMITIDOS[(a.content_type ?? "").toLowerCase().split(";")[0].trim()];
  const porNombre = (a.filename ?? "").toLowerCase().match(/\.(pdf|jpe?g|png|webp)$/)?.[1]?.replace("jpeg", "jpg") ?? null;
  const ext = porTipo ?? porNombre;
  if (!ext) return null;
  if (a.size > ADJUNTO_MAX_BYTES) return null;
  if ((a.content_disposition ?? "").toLowerCase() === "inline" && a.content_id && ext !== "pdf" && a.size < 60_000) return null;
  return ext;
}

export function mimeDeExtension(ext: string): string {
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

export function nombreArchivoSeguro(nombre: string | null | undefined, ext: string, i: number): string {
  const base = (nombre ?? "").replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || `adjunto-${i + 1}`}.${ext}`;
}

function uniq<T>(xs: T[]): T[] { return Array.from(new Set(xs)); }
