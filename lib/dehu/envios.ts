// DEHú AUTOMÁTICA — qué se guarda de cada envío de la DEHú (módulo PURO, 29/09/2026).
//
// La DEHú del despacho recibe TODO lo suyo (Hacienda, Seguridad Social, tráfico…). Aproba
// solo guarda lo de extranjería y nacionalidad; del resto no guarda nada, solo lo cuenta.

import { claveNumero, limiteParaAbrir, normalizarDocumentoId, normalizarNif, type ExpedienteCandidato } from "@/lib/notificaciones-dehu";
import type { EnvioDehu } from "@/lib/dehu/soap";

// Quién la EMITE decide: Delegaciones y Subdelegaciones del Gobierno (Oficinas de
// Extranjería), Policía (TIE, huellas, asilo), Migraciones (incluida la UGE), Justicia y
// Registro Civil (nacionalidad), Exteriores y consulados (visados). El ministerio RAÍZ no
// basta: Inclusión también es la Seguridad Social, y Política Territorial no es solo
// extranjería. Lo fiscal, laboral o de tráfico no entra nunca, lo diga o no el asunto.
const EMISOR_EXTRANJERIA = /extranjer|delegaci[oó]n del gobierno|subdelegaci[oó]n del gobierno|migra|polic[ií]a|comisar[ií]a|asilo|protecci[oó]n internacional|refugi|justicia|nacionalidad|seguridad jur[ií]dica|fe p[uú]blica|registro civil|exteriores|consulad|visad/i;
const EMISOR_AJENO = /seguridad social|tesorer[ií]a|tributari|hacienda|aduanas|tr[aá]fico|catastro|empleo|\bsepe\b|mutua|inspecci[oó]n de trabajo|ayuntamiento|diputaci[oó]n|juzgado|tribunal/i;
const ASUNTO_EXTRANJERIA = /extranjer|residencia|arraigo|reagrupaci|nacionalidad|\bTIE\b|\bNIE\b|autorizaci[oó]n de (residencia|estancia|trabajo)|protecci[oó]n internacional|visado/i;

// La DEHú no deja buscar las ya abiertas más atrás de 30 días: «4224 La "Fecha Desde" no
// puede ser anterior a "30" días» (02/10/2026, primera consulta real). Se piden 29 como
// mucho, con un día de margen por la hora de su servidor. Lo abierto antes queda fuera.
export const DIAS_REALIZADAS_MAX = 29;
export function desdeRealizadas(realizadasDesde: string | null, hasta: Date): Date {
  const minimo = hasta.getTime() - DIAS_REALIZADAS_MAX * 86_400_000;
  const pedido = realizadasDesde ? new Date(realizadasDesde).getTime() : minimo;
  return new Date(Number.isFinite(pedido) ? Math.max(pedido, minimo) : minimo);
}

export function esDeExtranjeria(e: Pick<EnvioDehu, "organismo" | "organismoRaiz" | "concepto" | "descripcion">): boolean {
  const emisor = e.organismo.nombre ?? "";
  const suyo = EMISOR_EXTRANJERIA.test(emisor), ajeno = EMISOR_AJENO.test(emisor);
  if (suyo !== ajeno) return suyo;
  // Emisor genérico, o un ministerio con las dos cosas en el nombre («Inclusión, Seguridad
  // Social y Migraciones»): decide el asunto.
  return ASUNTO_EXTRANJERIA.test(`${e.concepto} ${e.descripcion ?? ""}`);
}

// ¿Nombra el asunto el nº oficial de algún expediente del despacho? (se compara sin
// espacios, puntos, guiones ni barras). Solo números de 5 o más caracteres.
export function numeroOficialEnTexto(textoLibre: string, cands: Pick<ExpedienteCandidato, "numeroOficial">[]): string | null {
  const t = claveNumero(textoLibre);
  if (t.length < 5) return null;
  const hit = cands.map((c) => c.numeroOficial).filter((n): n is string => Boolean(n && claveNumero(n).length >= 5))
    .find((n) => t.includes(claveNumero(n)));
  return hit ?? null;
}

// Día (AAAA-MM-DD, hora de Madrid) de una fecha xsd:dateTime.
export function diaMadrid(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// Lo que se guarda de un envío pendiente, sin tocar la base: la fila del aviso «LEMA».
// `titularNifConexion`: el NIF del despacho (el del certificado). Si el titular del envío
// es OTRA persona (el despacho la representa), su NIE sirve para proponer el expediente.
export type AvisoDeEnvio = {
  huella: string; tipo: "AVISO"; organismo: string | null; asunto: string | null; resumen: string | null;
  titularNombre: string | null; nie: string | null; numeroExpediente: string | null;
  fechaPuestaDisposicion: string | null; fechaLimite: string | null;
  aviso: Record<string, unknown>;
};
export const huellaLema = (identificador: string) => `lema:${identificador}`;

export function avisoDeEnvio(e: EnvioDehu, titularNifConexion: string | null, ahora: Date = new Date()): AvisoDeEnvio {
  const nifTitular = normalizarNif(e.titular.nif);
  const esOtro = Boolean(nifTitular && nifTitular !== normalizarNif(titularNifConexion));
  const puesta = e.fechaPuestaDisposicion ? new Date(e.fechaPuestaDisposicion) : ahora;
  const puestaOk = Number.isNaN(puesta.getTime()) ? ahora : puesta;
  return {
    huella: huellaLema(e.identificador),
    tipo: "AVISO",
    organismo: e.organismo.nombre ?? e.organismoRaiz.nombre,
    asunto: e.concepto.trim().slice(0, 200) || null,
    resumen: e.descripcion ? e.descripcion.slice(0, 600) : null,
    titularNombre: esOtro ? e.titular.nombre : null,
    nie: esOtro ? normalizarDocumentoId(nifTitular) : null,
    numeroExpediente: null,
    fechaPuestaDisposicion: diaMadrid(puestaOk.toISOString()),
    // Una comunicación no caduca ni tiene efectos: sin cuenta atrás.
    fechaLimite: e.tipoEnvio === 2 ? limiteParaAbrir(puestaOk).toISOString() : null,
    aviso: {
      canal: "LEMA", identificador: e.identificador, codigoOrigen: e.codigoOrigen, concepto: e.concepto.slice(0, 255),
      tipoEnvio: e.tipoEnvio, vinculo: e.vinculo, organismoCodigo: e.organismo.codigo, organismoRaiz: e.organismoRaiz.nombre,
      titularNombre: e.titular.nombre, titularNif: nifTitular, puestaDisposicionAt: e.fechaPuestaDisposicion,
    },
  };
}

// Estados de una ya realizada: con documento que traer, o cerrada sin abrir.
export const REALIZADA_CON_DOCUMENTO = new Set(["ACEPTADA", "LEIDA"]);
export const REALIZADA_SIN_ABRIR = new Set(["RECHAZADA", "EXPIRADA", "REALIZADA_TEU"]);
