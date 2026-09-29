// DEHú AUTOMÁTICA (Gran Destinatario / LEMA) — mensajes SOAP, sin red (29/09/2026).
//
// Lo que Aproba manda a la DEHú y cómo lee lo que vuelve. Formatos tomados de los WSDL
// públicos de producción (gd-dehuws.redsara.es/ws/v2/lema?wsdl y /ws/v1/realizadas?wsdl):
//   · Localiza            → notificaciones PENDIENTES (sin abrirlas: ningún efecto jurídico).
//   · PeticionAcceso      → ABRIR una notificación (evento «1» = aceptada): vale como
//                            comparecencia (art. 43.2 Ley 39/2015). Solo a petición del gestor.
//   · LocalizaRealizadas  → las ya abiertas, rechazadas o expiradas (por cualquier canal).
//   · ConsultaRealizadas  → el documento de una ya abierta (sin nuevo efecto jurídico).
// Seguridad: WS-Security con el certificado del despacho (BinarySecurityToken X.509, firma
// RSA-SHA512 sobre el Timestamp y el Body, exc-c14n): la DEHú rechaza el SHA-1 desde 07/2026.
// Los documentos vuelven como adjuntos MIME (swaRef en LEMA, MTOM/XOP en Realizadas).

import { randomUUID } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

export const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  wsse: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
  wsu: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd",
  localiza: "http://administracion.gob.es/punto-unico-notificaciones/localiza",
  peticionAcceso: "http://administracion.gob.es/punto-unico-notificaciones/peticionAcceso",
  consultaAnexos: "http://administracion.gob.es/punto-unico-notificaciones/consultaAnexos",
  localizaRealizadas: "http://administracion.gob.es/punto-unico-notificaciones/localizaRealizadas",
  consultaRealizadas: "http://administracion.gob.es/punto-unico-notificaciones/consultaRealizadas",
} as const;
const X509V3 = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
const BASE64 = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";
const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const RSA_SHA512 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512";
const SHA512 = "http://www.w3.org/2001/04/xmlenc#sha512";

export type Operacion = "Localiza" | "PeticionAcceso" | "ConsultaAnexos" | "LocalizaRealizadas" | "ConsultaRealizadas";
export const ACCION_SOAP: Record<Operacion, string> = {
  Localiza: "https://administracionelectronica.gob.es/notifica/ws/lema/Localiza",
  PeticionAcceso: "https://administracionelectronica.gob.es/notifica/ws/lema/PeticionAcceso",
  ConsultaAnexos: "https://administracionelectronica.gob.es/notifica/ws/lema/ConsultaAnexos",
  LocalizaRealizadas: "https://administracionelectronica.gob.es/notifica/ws/lema/LocalizaRealizadas",
  ConsultaRealizadas: "https://administracionelectronica.gob.es/notifica/ws/lema/ConsultaRealizadas",
};

// Pruebas = «Servicios Estables» (prefijo se-). El entorno lo fija la conexión del despacho.
// Comprobado el 29/09/2026: se-dehuws.redsara.es responde 301 hacia se-gd-dehuws (un POST
// no sigue redirecciones), así que se llama directamente a se-gd-dehuws.
export type Entorno = "PRUEBAS" | "PRODUCCION";
export const ENDPOINTS: Record<Entorno, { lema: string; realizadas: string }> = {
  PRUEBAS: { lema: "https://se-gd-dehuws.redsara.es/ws/v2/lema", realizadas: "https://se-gd-dehuws.redsara.es/ws/v1/realizadas" },
  PRODUCCION: { lema: "https://gd-dehuws.redsara.es/ws/v2/lema", realizadas: "https://gd-dehuws.redsara.es/ws/v1/realizadas" },
};
export const servicioDe = (op: Operacion): "lema" | "realizadas" => (op === "LocalizaRealizadas" || op === "ConsultaRealizadas" ? "realizadas" : "lema");

// ── Cuerpos ────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fechaXsd = (d: Date) => d.toISOString();
const el = (p: string, nombre: string, v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : `<${p}:${nombre}>${esc(String(v))}</${p}:${nombre}>`;

export type FiltroLocaliza = { nifTitular?: string | null; nifDestinatario?: string | null; fechaDesde?: Date | null; fechaHasta?: Date | null; tipoEnvio?: 1 | 2 | null };

// El orden de los elementos es el de la secuencia del WSDL: no cambiarlo.
export function cuerpoLocaliza(f: FiltroLocaliza): string {
  return `<loc:Localiza xmlns:loc="${NS.localiza}">${el("loc", "nifTitular", f.nifTitular)}${el("loc", "nifDestinatario", f.nifDestinatario)}`
    + `${f.fechaDesde ? el("loc", "fechaDesde", fechaXsd(f.fechaDesde)) : ""}${f.fechaHasta ? el("loc", "fechaHasta", fechaXsd(f.fechaHasta)) : ""}`
    + `${el("loc", "tipoEnvio", f.tipoEnvio)}</loc:Localiza>`;
}

export function cuerpoLocalizaRealizadas(f: FiltroLocaliza & { pagina?: number | null }): string {
  return `<lre:LocalizaRealizadas xmlns:lre="${NS.localizaRealizadas}">${el("lre", "nifTitular", f.nifTitular)}${el("lre", "nifDestinatario", f.nifDestinatario)}`
    + `${f.fechaDesde ? el("lre", "fechaDesde", fechaXsd(f.fechaDesde)) : ""}${f.fechaHasta ? el("lre", "fechaHasta", fechaXsd(f.fechaHasta)) : ""}`
    + `${el("lre", "tipoEnvio", f.tipoEnvio)}${el("lre", "pagina", f.pagina)}</lre:LocalizaRealizadas>`;
}

export type RefEnvio = { identificador: string; codigoOrigen: string; concepto: string };
const concepto255 = (c: string) => (c.trim() || "Notificación").slice(0, 255);

// Abrir: vale como comparecencia. «Receptor» = la persona (o entidad) del certificado.
export function cuerpoPeticionAcceso(r: RefEnvio, receptor: { nif: string; nombre: string }): string {
  return `<pac:PeticionAcceso xmlns:pac="${NS.peticionAcceso}">${el("pac", "identificador", r.identificador)}${el("pac", "codigoOrigen", r.codigoOrigen)}`
    + `${el("pac", "nifReceptor", receptor.nif)}${el("pac", "nombreReceptor", receptor.nombre)}<pac:evento>1</pac:evento>`
    + `${el("pac", "concepto", concepto255(r.concepto))}</pac:PeticionAcceso>`;
}

export function cuerpoConsultaRealizadas(r: RefEnvio, peticion: { nif: string; nombre: string }): string {
  return `<cre:ConsultaRealizadas xmlns:cre="${NS.consultaRealizadas}">${el("cre", "identificador", r.identificador)}${el("cre", "codigoOrigen", r.codigoOrigen)}`
    + `${el("cre", "nifPeticion", peticion.nif)}${el("cre", "nombrePeticion", peticion.nombre)}${el("cre", "concepto", concepto255(r.concepto))}</cre:ConsultaRealizadas>`;
}

export function cuerpoConsultaAnexos(r: Omit<RefEnvio, "concepto">, nifReceptor: string, referencia: string): string {
  return `<pca:ConsultaAnexos xmlns:pca="${NS.consultaAnexos}">${el("pca", "nifReceptor", nifReceptor)}${el("pca", "identificador", r.identificador)}`
    + `${el("pca", "codigoOrigen", r.codigoOrigen)}${el("pca", "referencia", referencia)}</pca:ConsultaAnexos>`;
}

// ── Sobre firmado (WS-Security) ────────────────────────────────────────────
export type Firmante = { clavePrivadaPem: string; certificadoDerB64: string };

export function sobreFirmado(cuerpo: string, f: Firmante, ahora: Date = new Date(), vigenciaSeg = 300): string {
  const id = randomUUID();
  const idTs = `TS-${id}`, idCuerpo = `id-${id}`, idCert = `X509-${id}`;
  const creado = ahora.toISOString();
  const expira = new Date(ahora.getTime() + vigenciaSeg * 1000).toISOString();
  const xml = `<soapenv:Envelope xmlns:soapenv="${NS.soap}"><soapenv:Header>`
    + `<wsse:Security xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}" soapenv:mustUnderstand="1">`
    + `<wsu:Timestamp wsu:Id="${idTs}"><wsu:Created>${creado}</wsu:Created><wsu:Expires>${expira}</wsu:Expires></wsu:Timestamp>`
    + `<wsse:BinarySecurityToken EncodingType="${BASE64}" ValueType="${X509V3}" wsu:Id="${idCert}">${f.certificadoDerB64}</wsse:BinarySecurityToken>`
    + `</wsse:Security></soapenv:Header>`
    + `<soapenv:Body xmlns:wsu="${NS.wsu}" wsu:Id="${idCuerpo}">${cuerpo}</soapenv:Body></soapenv:Envelope>`;
  const firma = new SignedXml({
    privateKey: f.clavePrivadaPem,
    signatureAlgorithm: RSA_SHA512,
    canonicalizationAlgorithm: EXC_C14N,
    idMode: "wssecurity",
    getKeyInfoContent: () => `<wsse:SecurityTokenReference><wsse:Reference URI="#${idCert}" ValueType="${X509V3}"/></wsse:SecurityTokenReference>`,
  });
  firma.addReference({ xpath: "//*[local-name(.)='Timestamp']", transforms: [EXC_C14N], digestAlgorithm: SHA512 });
  firma.addReference({ xpath: "//*[local-name(.)='Body']", transforms: [EXC_C14N], digestAlgorithm: SHA512 });
  firma.computeSignature(xml, {
    prefix: "ds",
    location: { reference: "//*[local-name(.)='Security']", action: "append" },
    existingPrefixes: { wsse: NS.wsse },
  });
  return firma.getSignedXml();
}

// ── Respuestas ─────────────────────────────────────────────────────────────
export class ErrorDehu extends Error {
  constructor(message: string, readonly codigo: string | null = null, readonly http: number | null = null) { super(message); this.name = "ErrorDehu"; }
}

// Cuerpo HTTP → XML raíz + adjuntos por Content-ID (sin < >). Admite respuestas simples y
// multipart/related (SwA y MTOM/XOP).
export function separarMultipart(cuerpo: Buffer, contentType: string): { xml: string; adjuntos: Map<string, Buffer> } {
  const adjuntos = new Map<string, Buffer>();
  const ct = contentType || "";
  if (!/multipart\/related/i.test(ct)) return { xml: cuerpo.toString("utf8"), adjuntos };
  const boundary = /boundary="?([^";]+)"?/i.exec(ct)?.[1];
  if (!boundary) return { xml: cuerpo.toString("utf8"), adjuntos };
  const inicio = /start="?<?([^";>]+)>?"?/i.exec(ct)?.[1] ?? null;
  const marca = Buffer.from(`--${boundary}`);
  const partes: Buffer[] = [];
  let pos = cuerpo.indexOf(marca);
  while (pos !== -1) {
    const desde = pos + marca.length;
    if (cuerpo.subarray(desde, desde + 2).toString() === "--") break; // cierre
    const sig = cuerpo.indexOf(marca, desde);
    if (sig === -1) break;
    partes.push(cuerpo.subarray(desde, sig));
    pos = sig;
  }
  let raiz: string | null = null;
  let primera: string | null = null;
  for (const p of partes) {
    const sinSalto = p.subarray(p.subarray(0, 2).toString() === "\r\n" ? 2 : 0);
    const corte = sinSalto.indexOf("\r\n\r\n");
    if (corte === -1) continue;
    const cabeceras = sinSalto.subarray(0, corte).toString("latin1");
    let datos = sinSalto.subarray(corte + 4);
    if (datos.subarray(datos.length - 2).toString() === "\r\n") datos = datos.subarray(0, datos.length - 2);
    const cab = (n: string) => new RegExp(`^${n}:\\s*(.+)$`, "im").exec(cabeceras)?.[1]?.trim() ?? "";
    if (/base64/i.test(cab("Content-Transfer-Encoding"))) datos = Buffer.from(datos.toString("latin1").replace(/\s+/g, ""), "base64");
    const cid = cab("Content-ID").replace(/^<|>$/g, "");
    const esXml = /xml/i.test(cab("Content-Type"));
    if (primera === null && esXml) primera = datos.toString("utf8");
    if (inicio && cid === inicio) raiz = datos.toString("utf8");
    else if (cid) adjuntos.set(cid, datos);
  }
  return { xml: raiz ?? primera ?? "", adjuntos };
}

type Nodo = Element;
const elementos = (n: Node | null | undefined): Nodo[] => {
  const out: Nodo[] = [];
  if (!n) return out;
  for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as Nodo);
  return out;
};
export const hijo = (n: Node | null | undefined, nombre: string): Nodo | null => elementos(n).find((e) => e.localName === nombre) ?? null;
export const hijos = (n: Node | null | undefined, nombre: string): Nodo[] => elementos(n).filter((e) => e.localName === nombre);
const txt = (n: Node | null | undefined): string | null => {
  const s = n?.textContent?.trim();
  return s ? s : null;
};
export const texto = (n: Node | null | undefined, nombre: string): string | null => txt(hijo(n, nombre));

// XML → el elemento de respuesta dentro del Body. Un SOAP Fault es un error.
export function elementoRespuesta(xml: string): Nodo {
  const errores: string[] = [];
  const doc = new DOMParser({ errorHandler: (nivel: string, msg: string) => { if (nivel !== "warning") errores.push(String(msg)); } }).parseFromString(xml || "<vacio/>", "text/xml");
  const raiz = doc.documentElement as unknown as Nodo | null;
  if (!raiz || errores.length) throw new ErrorDehu("La DEHú devolvió una respuesta que no se puede leer.");
  const cuerpo = hijo(raiz, "Body");
  if (!cuerpo) throw new ErrorDehu("La respuesta de la DEHú no trae cuerpo SOAP.");
  const primero = elementos(cuerpo)[0] ?? null;
  if (!primero) throw new ErrorDehu("La respuesta de la DEHú viene vacía.");
  if (primero.localName === "Fault") {
    const motivo = texto(primero, "faultstring") ?? texto(hijo(primero, "Reason"), "Text") ?? "error desconocido";
    throw new ErrorDehu(`La DEHú rechazó la petición: ${motivo}`, texto(primero, "faultcode"));
  }
  return primero;
}

export type Organismo = { codigo: string | null; nombre: string | null; nif: string | null };
export type EnvioDehu = {
  identificador: string; codigoOrigen: string; concepto: string; descripcion: string | null;
  organismo: Organismo; organismoRaiz: Organismo;
  fechaPuestaDisposicion: string | null;     // ISO tal cual la manda la DEHú
  tipoEnvio: 1 | 2;                          // 1 comunicación · 2 notificación
  vinculo: number | null;                    // 1 titular · 2 destinatario · 3 apoderado (4-5 en Realizadas)
  titular: { nombre: string | null; nif: string | null };
  metadatosPublicos: string | null;
  // Solo en Realizadas:
  estado: string | null;                     // ACEPTADA · RECHAZADA · EXPIRADA · REALIZADA_TEU · LEIDA
  receptor: { nombre: string | null; nif: string | null } | null;
};

const organismoDe = (n: Nodo | null): Organismo => ({ codigo: texto(n, "codigoOrganismo"), nombre: texto(n, "nombreOrganismo"), nif: texto(n, "nifOrganismo") });

function envioDe(item: Nodo): EnvioDehu | null {
  const identificador = texto(item, "identificador");
  const codigoOrigen = texto(item, "codigoOrigen");
  if (!identificador || !codigoOrigen) return null;
  const tit = hijo(item, "titular");
  const rec = hijo(item, "receptor");
  const vinculo = Number(texto(item, "vinculo"));
  return {
    identificador, codigoOrigen,
    concepto: hijo(item, "concepto")?.textContent ?? "",
    descripcion: texto(item, "descripcion"),
    organismo: organismoDe(hijo(item, "organismoEmisor")),
    organismoRaiz: organismoDe(hijo(item, "organismoEmisorRaiz")),
    fechaPuestaDisposicion: texto(item, "fechaPuestaDisposicion"),
    tipoEnvio: texto(item, "tipoEnvio") === "1" ? 1 : 2,
    vinculo: Number.isFinite(vinculo) && vinculo > 0 ? vinculo : null,
    titular: { nombre: texto(tit, "nombreTitular"), nif: texto(tit, "nifTitular") },
    metadatosPublicos: texto(item, "metadatosPublicos"),
    estado: texto(item, "estado"),
    receptor: rec ? { nombre: texto(rec, "nombreReceptor"), nif: texto(rec, "nifReceptor") } : null,
  };
}

export type RespuestaBase = { codigo: string | null; descripcion: string | null };
export type RespuestaLocaliza = RespuestaBase & { envios: EnvioDehu[]; hayMas: boolean };
export type RespuestaLocalizaRealizadas = RespuestaBase & { envios: EnvioDehu[]; totalPaginas: number; paginaActual: number };

const base = (r: Nodo): RespuestaBase => ({ codigo: texto(r, "codigoRespuesta"), descripcion: texto(r, "descripcionRespuesta") });
const enviosDe = (r: Nodo) => hijos(hijo(r, "envios"), "item").map(envioDe).filter((e): e is EnvioDehu => Boolean(e));

export function leerLocaliza(r: Nodo): RespuestaLocaliza {
  return { ...base(r), envios: enviosDe(r), hayMas: texto(r, "hayMasResultados") === "true" };
}
export function leerLocalizaRealizadas(r: Nodo): RespuestaLocalizaRealizadas {
  const total = Number(texto(r, "totalPaginas")), actual = Number(texto(r, "paginaActual"));
  return { ...base(r), envios: enviosDe(r), totalPaginas: Number.isFinite(total) ? total : 1, paginaActual: Number.isFinite(actual) ? actual : 1 };
}

// ── Documentos ─────────────────────────────────────────────────────────────
export type DocumentoDehu = { nombre: string | null; mime: string | null; bytes: Buffer | null; csv: string | null; enlace: string | null; hash: string | null };
export type AnexoDehu = { nombre: string | null; mime: string | null; referencia: string | null; enlace: string | null };
export type RespuestaDocumento = RespuestaBase & { fecha: string | null; documento: DocumentoDehu | null; anexos: AnexoDehu[] };

// El contenido llega como adjunto (swaRef: href="cid:…"; MTOM: <xop:Include href="cid:…">),
// o en base64 dentro del propio elemento. Se busca en ese orden.
export function contenidoDe(n: Nodo | null, adjuntos: Map<string, Buffer>): Buffer | null {
  if (!n) return null;
  const cid = (href: string | null | undefined) => {
    const id = decodeURIComponent(String(href ?? "").replace(/^cid:/i, ""));
    return id ? adjuntos.get(id) ?? null : null;
  };
  const directo = cid(n.getAttribute("href"));
  if (directo) return directo;
  const pendientes: Nodo[] = [n];
  while (pendientes.length) {
    const actual = pendientes.shift()!;
    for (const h of elementos(actual)) {
      if (h.localName === "Include") { const b = cid(h.getAttribute("href")); if (b) return b; }
      pendientes.push(h);
    }
  }
  const interno = hijo(n, "contenido");
  if (interno) return contenidoDe(interno, adjuntos);
  const b64 = (n.textContent ?? "").replace(/\s+/g, "");
  if (b64.length >= 8 && /^[A-Za-z0-9+/]+=*$/.test(b64)) return Buffer.from(b64, "base64");
  return null;
}

function documentoDe(n: Nodo | null, adjuntos: Map<string, Buffer>): DocumentoDehu | null {
  if (!n) return null;
  const cont = hijo(n, "contenido");
  const mime = texto(n, "mimeType") ?? texto(cont, "tipoMIME");
  const hash = hijo(n, "hashDocumento");
  return {
    nombre: texto(n, "nombre"), mime, bytes: contenidoDe(cont, adjuntos), csv: texto(n, "csvResguardo"),
    enlace: texto(n, "enlaceDocumento"), hash: hash ? `${texto(hash, "algoritmoHash") ?? ""}:${texto(hash, "hash") ?? ""}` : null,
  };
}
function anexosDe(n: Nodo | null): AnexoDehu[] {
  if (!n) return [];
  const lista = [...hijos(hijo(n, "anexosReferencia"), "anexoReferencia"), ...hijos(hijo(n, "anexosUrl"), "anexoUrl")];
  return lista.map((a) => ({ nombre: texto(a, "nombre"), mime: texto(a, "mimeType"), referencia: texto(a, "referenciaDocumento"), enlace: texto(a, "enlaceDocumento") }));
}

export function leerDocumento(r: Nodo, adjuntos: Map<string, Buffer>): RespuestaDocumento {
  return {
    ...base(r),
    fecha: texto(r, "fechaEvento") ?? texto(r, "fechaUltimoEstado"),
    documento: documentoDe(hijo(r, "documento"), adjuntos),
    anexos: anexosDe(hijo(r, "anexos")),
  };
}

// «000» (o vacío) es el éxito habitual de estos servicios; cualquier otro código se guarda
// en el registro de usos para poder leerlo.
export const esCodigoExito = (c: string | null) => !c || /^0+$/.test(c);
