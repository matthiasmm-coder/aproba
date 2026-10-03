import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFDropdown, PDFName, PDFString, PDFTextField, type PDFForm } from "pdf-lib";
import { normalizarFuenteDA } from "@/lib/ex-forms";
import type { DatosForm } from "@/lib/formularios";
import { esUeEee, type DatosCanje } from "@/lib/canje";

// IMPRESOS OFICIALES DE LA DGT PARA EL CANJE (03/10/2026, Matthias; Jennifer y Samara pedían
// «los formularios de la DGT»). La sede de la DGT exige «la solicitud de canje cumplimentada
// en impreso oficial» — el Mod. 03 «Trámites de conductores» (versión 2026-05) — y, para que
// otra persona la presente, el Mod. 24 «Otorgamiento de una representación» (Registro de
// apoderamientos), firmado por los dos. Ambos son AcroForm: se rellenan por nombre de campo,
// con las posiciones comprobadas sobre el impreso (la PRIMERA fila «Datos del permiso» es la
// del canje; la segunda, la de sustitución). Quedan EDITABLES. Plantillas: forms/dgt/ (PDF
// oficiales de sede.dgt.gob.es, sin tocar).

export type ModeloDgt = "03" | "24";

const limpiar = (s: string | null | undefined) =>
  String(s ?? "").replace(/€/g, " EUR").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[^\x00-\xFF]/g, "").replace(/\s+/g, " ").trim();
const ddmmaaaa = (iso: string) => { const [a, m, d] = (iso ?? "").slice(0, 10).split("-"); return a && m && d ? `${d}/${m}/${a}` : ""; };
// Día, mes y año en Madrid, como el «En …, a …» de la hoja de encargo (lib/encargo.ts).
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const partesMadrid = (d: Date) => { const [anio, mes, dia] = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }).split("-").map(Number); return { dia, mes: mes - 1, anio }; };

// La provincia del impreso es una LISTA con los nombres oficiales («Coruña, A», «Palmas,
// Las»…): por el código postal (sus dos primeras cifras = código INE de la provincia) y, si no
// hay, por el nombre que escribió el cliente.
const PROVINCIA_POR_CP: Record<string, string> = {
  "01": "Araba/Álava", "02": "Albacete", "03": "Alicante/Alacant", "04": "Almería", "05": "Ávila", "06": "Badajoz",
  "07": "Balears, Illes", "08": "Barcelona", "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón/Castelló",
  "13": "Ciudad Real", "14": "Córdoba", "15": "Coruña, A", "16": "Cuenca", "17": "Girona", "18": "Granada",
  "19": "Guadalajara", "20": "Gipuzkoa", "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
  "26": "Rioja, La", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense",
  "33": "Asturias", "34": "Palencia", "35": "Palmas, Las", "36": "Pontevedra", "37": "Salamanca",
  "38": "Santa Cruz de Tenerife", "39": "Cantabria", "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona",
  "44": "Teruel", "45": "Toledo", "46": "Valencia/València", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora",
  "50": "Zaragoza", "51": "Ceuta", "52": "Melilla",
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const ALIAS_PROVINCIA: Record<string, string> = {
  "la coruna": "15", "a coruna": "15", coruna: "15", baleares: "07", "islas baleares": "07", "illes balears": "07",
  "las palmas": "35", "gran canaria": "35", "la rioja": "26", vizcaya: "48", guipuzcoa: "20", alava: "01",
  gerona: "17", lerida: "25", orense: "32", tenerife: "38", nafarroa: "31",
};
export function provinciaDgt(cp: string | null | undefined, nombre: string | null | undefined): string | null {
  const c = /^\s*(\d{2})\d{3}\s*$/.exec(cp ?? "")?.[1];
  if (c && PROVINCIA_POR_CP[c]) return PROVINCIA_POR_CP[c];
  const n = norm(nombre ?? "");
  if (!n) return null;
  if (ALIAS_PROVINCIA[n]) return PROVINCIA_POR_CP[ALIAS_PROVINCIA[n]];
  for (const op of Object.values(PROVINCIA_POR_CP)) {
    // «Alicante/Alacant» → las dos; «Coruña, A» → «coruna» y «a coruna».
    const partes = op.split("/").flatMap((p) => { const [base, art] = p.split(", "); return art ? [base, `${art} ${base}`] : [base]; });
    if (partes.some((p) => norm(p) === n)) return op;
  }
  return null;
}

// «Calle Mayor» → tipo «Calle» + «Mayor»; sin un tipo reconocible, todo va al nombre de la vía.
const TIPO_VIA = /^(calle|avenida|avda\.?|av\.?|plaza|pza\.?|pl\.?|paseo|p[ºo]\.?|camino|carretera|ctra\.?|ronda|traves[ií]a|trav\.?|glorieta|rambla|urbanizaci[oó]n|urb\.?|pasaje|callej[oó]n|carrer|avinguda|passeig|pla[cç]a|v[ií]a)\s+(.+)$/i;
export function partirVia(via: string | null | undefined): { tipo: string; nombre: string } {
  const v = limpiar(via);
  const barra = /^c\s*\/\s*(.+)$/i.exec(v);
  if (barra) return { tipo: "Calle", nombre: barra[1].trim() };
  const m = TIPO_VIA.exec(v);
  return m ? { tipo: m[1], nombre: m[2].trim() } : { tipo: "", nombre: v };
}
// «3º 2ª» → planta «3º», puerta «2ª»; «1-B» → «1» y «B»; una sola pieza → planta.
export function partirPiso(piso: string | null | undefined): { planta: string; puerta: string } {
  const p = limpiar(piso).split(/[\s\-,]+/).filter(Boolean);
  return { planta: p[0] ?? "", puerta: p.slice(1).join(" ") };
}
// «Teléfono» del Mod. 03 admite 9 caracteres: el número español sin prefijo ni espacios
// («+34 611 205 874» → «611205874»; antes, todo número con +34 dejaba la casilla vacía).
// Uno extranjero no cabe: mejor el hueco que un número cortado.
export function telefonoDgt(tel: string | null | undefined): string {
  const t = String(tel ?? "").replace(/[\s.\-()]/g, "");
  const d = t.startsWith("+34") ? t.slice(3) : t.startsWith("0034") ? t.slice(4) : t.startsWith("+") ? "" : /^34[6789]\d{8}$/.test(t) ? t.slice(2) : t;
  return /^[6789]\d{8}$/.test(d) ? d : "";
}

// El cuerpo de letra va en el /DA del CAMPO y de cada WIDGET, en una sola línea: varios campos
// del impreso de la DGT llevan su /DA solo en el widget, con tamaño automático («0 Tf»), y el
// setFontSize de pdf-lib no lo toca (salían a 16 pt); y Aperçu/PDFKit no hereda el /DA del
// campo (cae a 12 pt) — la misma trampa que lib/ex-forms.ts (sellarDA).
function fijarCuerpo(f: PDFTextField | PDFDropdown, cuerpo: number) {
  const ws = f.acroField.getWidgets();
  const base = f.acroField.getDefaultAppearance() ?? ws.map((w) => w.getDefaultAppearance()).find(Boolean) ?? "/Helv 0 Tf 0 g";
  const linea = base.replace(/\s+/g, " ").replace(/(\/[^\s]+)\s+[\d.]+\s+Tf/, `$1 ${cuerpo} Tf`).trim();
  f.acroField.setDefaultAppearance(linea);
  for (const w of ws) w.dict.set(PDFName.of("DA"), PDFString.of(linea));
}
// Casillas estrechas (día, año, fechas de 51 pt) a 8 pt; el resto a 9.
const cuerpoDe = (f: PDFTextField | PDFDropdown) => ((f.acroField.getWidgets()[0]?.getRectangle().width ?? 100) < 60 ? 8 : 9);

function poner(form: PDFForm, campo: string, valor: string | null | undefined) {
  const v = limpiar(valor);
  if (!v) return;
  try {
    const f = form.getTextField(campo);
    f.setText(v);
    fijarCuerpo(f, cuerpoDe(f));
  } catch { /* impreso cambiado: mejor un hueco que un PDF roto */ }
}
function elegir(form: PDFForm, grupo: string, opcion: string) {
  try { form.getRadioGroup(grupo).select(opcion); } catch { /* opción ausente */ }
}
function lugarYFecha(form: PDFForm, lugar: string | null | undefined, fecha: Date) {
  const p = partesMadrid(fecha);
  poner(form, "En", lugar);
  poner(form, "a", String(p.dia));
  poner(form, "de", MESES[p.mes]);
  poner(form, "de_2", String(p.anio));
}
async function cargar(modelo: ModeloDgt) {
  const bytes = await readFile(path.join(process.cwd(), "forms", "dgt", `mod${modelo}.pdf`));
  const pdf = await PDFDocument.load(bytes);
  return { pdf, form: pdf.getForm() };
}
async function cerrar(pdf: PDFDocument, form: PDFForm): Promise<Uint8Array> {
  // Todo campo de texto o lista con cuerpo fijo (también los vacíos, para quien escriba luego):
  // sin él, un visor que regenere la apariencia estira «28005» a 12-16 pt en 20 pt de alto.
  for (const f of form.getFields()) {
    if ((f instanceof PDFTextField && !f.getText()) || f instanceof PDFDropdown) try { fijarCuerpo(f, cuerpoDe(f)); } catch { /* sin /DA */ }
  }
  try { form.updateFieldAppearances(); } catch { /* ignore */ }
  normalizarFuenteDA(form);
  return pdf.save();
}

const nieDe = (d: DatosForm) => (d.nie1 && d.nie2 ? `${d.nie1}${d.nie2}${d.nie3}` : "");

// Mod. 03: la solicitud de canje, con la ficha del titular y los datos del permiso.
export async function rellenarMod03(o: { datos: DatosForm; canje: DatosCanje; lugar: string | null | undefined; fecha: Date }): Promise<Uint8Array> {
  const { pdf, form } = await cargar("03");
  const { datos: d, canje: c } = o;
  poner(form, "DNINIE", nieDe(d));
  if (d.fechaD && d.fechaM && d.fechaA) poner(form, "Fecha nacimiento", `${d.fechaD}/${d.fechaM}/${d.fechaA}`);
  poner(form, "País de nacimiento", d.paisNac);
  poner(form, "Nacionalidad", d.nacionalidad);
  poner(form, "Nombre", d.nombre);
  poner(form, "Apellido 1", d.apellido1);
  poner(form, "Apellido 2", d.apellido2);
  poner(form, "Correo electrónico", d.email);
  poner(form, "Teléfono", telefonoDgt(d.telefono));
  // Domicilio del TITULAR a efectos de notificaciones: el suyo, nunca el del despacho.
  const via = partirVia(d.domicilio);
  poner(form, "Tipo Vía", via.tipo);
  poner(form, "Nombre de la vía", via.nombre);
  poner(form, "Número", d.numero);
  const piso = partirPiso(d.piso);
  poner(form, "Planta", piso.planta);
  poner(form, "Puerta", piso.puerta);
  poner(form, "Código Postal", d.cp);
  const prov = provinciaDgt(d.cp, d.provincia);
  if (prov) try { form.getDropdown("Provincia").select(prov); } catch { /* lista cambiada */ }
  if (d.localidad) {
    // La lista de municipios la rellena el JavaScript del impreso al elegir provincia: aquí
    // va el del cliente como única opción, y también en «Localidad» por si el visor la vacía.
    try { const m = form.getDropdown("Municipio"); m.addOptions([limpiar(d.localidad)]); m.select(limpiar(d.localidad)); } catch { /* lista cambiada */ }
    poner(form, "Localidad", d.localidad);
  }
  elegir(form, "tramite", "Canje");
  elegir(form, "otros", c.pais && esUeEee(c.pais) ? "UE" : "otros paises");
  poner(form, "ClasePermiso", c.clases.join(", "));
  poner(form, "NumPer", c.numero);
  poner(form, "PaisExp", c.pais);
  poner(form, "FechaExp", ddmmaaaa(c.expedicion));
  poner(form, "FechaCad", ddmmaaaa(c.caducidad));
  lugarYFecha(form, o.lugar, o.fecha);
  return cerrar(pdf, form);
}

// Mod. 24: el titular autoriza al representante (el profesional del despacho o, sin él, el
// despacho) para el trámite «Canje de permiso de conducción», desde hoy. Las casillas de
// consentimiento se dejan como están: las marca quien firma.
export type RepresentanteDgt = { documento: string; nombre: string; apellidos: string };
export const CODIGO_CANJE_DGT = "000300010002 - Canje de permiso de conducción";
export async function rellenarMod24(o: { datos: DatosForm; representante: RepresentanteDgt; lugar: string | null | undefined; fecha: Date }): Promise<Uint8Array> {
  const { pdf, form } = await cargar("24");
  const r = o.representante;
  const [ap1, ...ap2] = limpiar(r.apellidos).split(" ").filter(Boolean);
  poner(form, "NIFNIECIF", r.documento.toUpperCase().replace(/[\s.\-]/g, ""));
  poner(form, "NombreRazón social", r.nombre);
  poner(form, "Apellido 1", ap1);
  poner(form, "Apellido 2", ap2.join(" "));
  const d = o.datos;
  poner(form, "NIFNIECIF_2", nieDe(d));
  poner(form, "NombreRazón social_2", d.nombre);
  poner(form, "Apellido 1_2", d.apellido1);
  poner(form, "Apellido 2_2", d.apellido2);
  try {
    const lista = form.getDropdown("Lista de trámites1");
    const op = lista.getOptions().find((x) => /canje de permiso de conducci/i.test(x)) ?? CODIGO_CANJE_DGT;
    lista.select(op);
  } catch { /* lista cambiada */ }
  const p = partesMadrid(o.fecha);
  poner(form, "Fecha InicioRow1", `${String(p.dia).padStart(2, "0")}/${String(p.mes + 1).padStart(2, "0")}/${p.anio}`);
  lugarYFecha(form, o.lugar, o.fecha);
  return cerrar(pdf, form);
}
