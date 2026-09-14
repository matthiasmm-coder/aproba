import "server-only";
import {
  BASE_052, UA_052, PROVINCIAS_052, TIPOS_VIA_052, sinAcentos, fechaLarga052, partirDomicilio052, codigoProvincia,
  parseProvincias, cuerpoLatin1, decodificarLatin1,
} from "@/lib/tasa790052";

// Tasa 790-062 (Ministerio de Política Territorial — Delegaciones y Subdelegaciones del
// Gobierno): «Tramitación de autorizaciones de TRABAJO a ciudadanos extranjeros». Es la otra
// mitad de la 052: la 052 paga la residencia y la 062 el trabajo (autorizaciones iniciales por
// cuenta ajena o propia, renovaciones, temporada, transfronterizos, art. 52 b-e). Pedida por
// Gesadmbcn el 14/09/2026.
//
// MISMO generador que la 052 (…/tasasPDF: sesión + captcha + PDF con código de barras, todo en
// ISO-8859-1) con tres diferencias, comprobadas el 14/09/2026 sobre la Sede real (fixture fiel
// en lib/tasa790062.test.ts):
//  1. Antes del impreso la Sede muestra una NOTA que hay que aceptar (POST prepareTasa con
//     aceptado=OK). Dice, en esencia: si la relación laboral es en CATALUÑA, las autorizaciones
//     INICIALES de trabajo (art. 73/83, 57, 156, 190, 191.x, 192 RLOEX) NO llevan esta tasa sino
//     la de la Generalitat (Departament d'Empresa i Ocupació). Las renovaciones (2.2.1) sí.
//  2. El impreso trae un bloque «DATOS DEL TRABAJADOR» (Nombre_Trabajador, Nacionalidad_Trabajador,
//     Direccion_Trabajador): la IDENTIFICACIÓN de cabecera es el SUJETO PASIVO — la empresa que
//     contrata en cuenta ajena, el propio trabajador en cuenta propia — y el trabajador va aparte.
//  3. No hay nacionalidad del declarante ni fechas de efectos/caducidad: todas las líneas son de
//     importe fijo. Reglamentos: RD 1155/2024 y RD 557/2011 (sin el RD 316/2026 de la regularización).

export const SEDE_062_INFO = "https://sede.administracionespublicas.gob.es/pagina/index/directorio/tasa062";
export const BASE_062 = BASE_052; // mismo servidor (…/tasasPDF)
export const UA_062 = UA_052;
export const REGLAMENTOS_062: { value: string; label: string }[] = [
  { value: "RD1155/2024", label: "RD 1155/2024 (Reglamento vigente)" },
  { value: "RD557/2011", label: "RD 557/2011 (Reglamento anterior)" },
];
// Provincias catalanas (código INE): ahí las autorizaciones INICIALES de trabajo se pagan a la
// Generalitat, no con esta tasa. Las líneas de renovación/prórroga sí siguen siendo la 062.
export const PROVINCIAS_CATALUNA = ["08", "17", "25", "43"];
export const EPIGRAFES_RENOVACION_062 = ["1.3.1", "2.2.1", "4.2.1", "4.2.2"];

export {
  PROVINCIAS_052 as PROVINCIAS_062, TIPOS_VIA_052 as TIPOS_VIA_062, sinAcentos, fechaLarga052 as fechaLarga062,
  partirDomicilio052 as partirDomicilio062, codigoProvincia, parseProvincias, cuerpoLatin1, decodificarLatin1,
};

export type Epigrafe062 = { id: string; codigo: string; label: string; importe: string; seccion: string };
export type Formulario062 = {
  justificante: string;
  epigrafes: Epigrafe062[];
  provinciasDom: string[]; // nombres tal como los espera Ctrl_ProvinciaDom
  reglamento: string;
};

const entidades = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const texto = (html: string) => entidades(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// La página intermedia de la NOTA: trae el botón «Aceptar» (aceptado=OK) y aún no el impreso.
export const esPaginaAceptacion062 = (html: string) => /name="aceptado"/i.test(html) && !/name="Ctrl_NumJustificante"/i.test(html);
// Mismos campos que envía el botón «Aceptar» de la Sede (comprobado el 14/09/2026).
export const cuerpoAceptacion062 = (idProvincia: string, reglamento: string) =>
  cuerpoLatin1({ Aceptar: "Aceptar", idTasa: "062", aceptado: "OK", idModelo: "790", idProvincia, reglamento });

// El impreso de la 062 se lee POR FILA: cada <TR> con una casilla epigrafeX.Y.Z lleva su
// descripción (un <label>, o la celda de título en la 5.1.1, que va sin <label>) y su importe
// en la última celda numérica. Las filas resaltadas (3.1.1) usan clases «bordeBlanco…» en vez de
// «bordeContenido…», por eso no se atan las clases como en la 052.
export function parseFormulario062(html: string): Formulario062 {
  const justificante = (html.match(/name="Ctrl_NumJustificante"[^>]*value="(\d+)"/) || html.match(/value="(\d{13})"[^>]*name="Ctrl_NumJustificante"/) || [])[1] ?? "";
  const reglamento = (html.match(/name="reglamento"[^>]*value="([^"]*)"/) || [])[1] ?? "";
  // Secciones «1.» «1.1» «2.»… → título (sin el punto final para poder buscar por «1» o «1.1»).
  const secciones: Record<string, string> = {};
  for (const m of html.matchAll(/<TD class="normalgrande(?:negrita)? borde(?:Contenido|Blanco)Right"[^>]*>\s*([\d.]+)\s*<\/TD>\s*<TD[^>]*>\s*([^<]+?)\s*<\/TD>/gi)) {
    secciones[m[1].replace(/\.$/, "")] = texto(m[2]);
  }
  const epigrafes: Epigrafe062[] = [];
  for (const row of html.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)) {
    const r = row[1];
    const cb = r.match(/<input[^>]*name="(epigrafe([\d.]+))"[^>]*>/i);
    if (!cb) continue;
    const codigo = cb[2];
    const importe = [...r.matchAll(/<TD[^>]*>\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*<\/TD>/gi)].map((m) => m[1]).pop();
    if (!importe) continue;
    const lab = r.match(/<label[^>]*>([\s\S]*?)<\/label>/i);
    let label = lab ? texto(lab[1]) : "";
    if (!label) {
      const celdas = [...r.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map((m) => texto(m[1])).filter((t) => t && !/^[\d.,\s]+$/.test(t));
      label = celdas[0] ?? codigo;
    }
    const padre = codigo.split(".").slice(0, 2).join(".");
    const seccion = secciones[padre] ?? secciones[codigo.split(".")[0]] ?? "";
    if (!epigrafes.some((e) => e.id === cb[1])) epigrafes.push({ id: cb[1], codigo, label, importe, seccion });
  }
  epigrafes.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const provinciasDom = [...html.matchAll(/nombre_provincias\[\d+\]\s*=\s*"([^"]*)"/g)].map((m) => entidades(m[1]));
  return { justificante, epigrafes, provinciasDom, reglamento };
}

// Todas las líneas de la 062 son de importe fijo.
export function importe062(e: Epigrafe062 | undefined): { euros: string; centimos: string; total: string } | null {
  if (!e) return null;
  const cent = Math.round(Number(String(e.importe).replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isFinite(cent) || cent <= 0) return null;
  return { euros: String(Math.floor(cent / 100)), centimos: String(cent % 100).padStart(2, "0"), total: (cent / 100).toFixed(2).replace(".", ",") };
}

// «Apellidos y Nombre», «Dirección postal completa (en España)» del bloque del trabajador, a
// partir de los datos normalizados del expediente / la ficha (todo editable en el modal).
export function nombreTrabajador062(apellido1: string, apellido2: string, nombre: string): string {
  const ap = `${apellido1} ${apellido2}`.replace(/\s+/g, " ").trim();
  return sinAcentos([ap, nombre.trim()].filter(Boolean).join(", "));
}
export function direccionTrabajador062(d: { domicilio: string; numero: string; piso: string; cp: string; localidad: string; provincia: string }): string {
  const via = [d.domicilio, d.numero].filter(Boolean).join(" ").trim();
  const linea = [via, d.piso].filter(Boolean).join(", ");
  const pueblo = [d.cp, d.localidad].filter(Boolean).join(" ").trim();
  const prov = d.provincia && sinAcentos(d.provincia) !== sinAcentos(d.localidad) ? ` (${d.provincia})` : "";
  return sinAcentos([linea, pueblo ? `${pueblo}${prov}` : ""].filter(Boolean).join(", "));
}
