import "server-only";

// Tasa 790-052 (Ministerio de Política Territorial, Delegaciones y Subdelegaciones del
// Gobierno) — «Tramitación de autorizaciones de residencia y otra documentación a
// ciudadanos extranjeros»: la tasa de las autorizaciones iniciales, renovaciones,
// arraigos, estudios, familiares de español, larga duración… Todo lo que NO es la 012
// (Policía: TIE, prórrogas de estancia sin visado, certificados) ni la 026 (nacionalidad).
//
// Igual que la 012, el generador oficial es una web con SESIÓN + CAPTCHA (6 caracteres):
// no existe PDF descargable. Flujo: prepareProvincia (cookies) → prepareTasa?idProvincia&
// reglamento (formulario con Nº de justificante asignado por su servidor + captcha) →
// POST generaDocPDF con todos los campos → PDF oficial con código de barras.
// La página es ISO-8859-1: hay que LEER en latin-1 y ENVIAR el cuerpo en latin-1 (una
// «Ñ» en UTF-8 llega como dos bytes y el servidor la imprime como «Ã‘»).
// Comprobado el 08/09/2026 sobre la Sede real (scratchpad p052-form.html).

export const SEDE_052_INFO = "https://sede.administracionespublicas.gob.es/pagina/index/directorio/tasa052";
export const BASE_052 = "https://sede.administracionespublicas.gob.es/tasasPDF";
export const UA_052 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Reglamentos que ofrece el generador (08/09/2026). El de la Regularización 2026 es el
// primero en la Sede; aquí el vigente general va por defecto.
export const REGLAMENTOS_052: { value: string; label: string }[] = [
  { value: "RD1155/2024", label: "RD 1155/2024 (Reglamento vigente)" },
  { value: "RD316/2026", label: "RD 316/2026 (Regularización extraordinaria 2026)" },
  { value: "RD557/2011", label: "RD 557/2011 (Reglamento anterior)" },
];

// Provincias (código INE → nombre) tal como las nombra la Sede. Repli si el mapa de la
// página no se puede leer; se prefiere la lista viva (parseProvincias).
export const PROVINCIAS_052: [string, string][] = [
  ["01", "Álava"], ["02", "Albacete"], ["03", "Alicante"], ["04", "Almería"], ["05", "Ávila"], ["06", "Badajoz"], ["07", "Baleares"], ["08", "Barcelona"],
  ["09", "Burgos"], ["10", "Cáceres"], ["11", "Cádiz"], ["12", "Castellón"], ["13", "Ciudad Real"], ["14", "Córdoba"], ["15", "A Coruña"], ["16", "Cuenca"],
  ["17", "Girona"], ["18", "Granada"], ["19", "Guadalajara"], ["20", "Guipúzcoa"], ["21", "Huelva"], ["22", "Huesca"], ["23", "Jaén"], ["24", "León"],
  ["25", "Lleida"], ["26", "La Rioja"], ["27", "Lugo"], ["28", "Madrid"], ["29", "Málaga"], ["30", "Murcia"], ["31", "Navarra"], ["32", "Ourense"],
  ["33", "Asturias"], ["34", "Palencia"], ["35", "Las Palmas"], ["36", "Pontevedra"], ["37", "Salamanca"], ["38", "Santa Cruz de Tenerife"], ["39", "Cantabria"], ["40", "Segovia"],
  ["41", "Sevilla"], ["42", "Soria"], ["43", "Tarragona"], ["44", "Teruel"], ["45", "Toledo"], ["46", "Valencia"], ["47", "Valladolid"], ["48", "Vizcaya"],
  ["49", "Zamora"], ["50", "Zaragoza"], ["51", "Ceuta"], ["52", "Melilla"],
];

// Tipos de vía del desplegable oficial (js/sgtic_tablas_genericas.js, 95 valores).
export const TIPOS_VIA_052 = ["ACCESO", "ACEQUIA", "ALAMEDA", "ALBEREDA", "ALDEA", "ALTO", "ANGOSTA", "ARROYO", "ATAJILLO", "ATAJO", "AVENIDA", "BAJADA", "BARRACAS", "BARRIADA", "BARRIO", "BLOQUE", "CALA", "CALLE", "CALLEJA", "CALLEJON", "CALLEJUELA", "CALZADA", "CAMINO", "CARRERA", "CARRETERA", "CARRIL", "CASA", "CASERIO", "COBERTIZO", "COLONIA", "CORRALILLO", "CORREDOR", "CORTIJO", "COSO", "COSTA", "COSTANILLA", "CRUCE", "CUESTA", "DEHESA", "DISEMINADO", "EDIFICIO", "ENSENADA", "ESCALA", "ESCALERA", "ESCALINATA", "FINCA", "GALERIA", "GLORIETA", "GRAN VIA", "GRUPO", "LUGAR", "MANZANA", "MONTE", "PARQUE", "PARTIDA", "PASADIZO", "PASAJE", "PASARELA", "PASEO", "PASILLO", "PASO", "PLAYA", "PLAZA", "PLAZOLETA", "PLAZUELA", "POBLADO", "PONTON", "PORTICO", "POSTIGO", "PUENTE", "PUERTO", "RAMBLA", "REGATO", "RIERA", "RINCONADA", "RONDA", "SENDA", "SENDERO", "SEQUIA", "SOLANA", "SUBIDA", "TORRENTE", "TRAVESIA", "TUNEL", "URBANIZACION", "VALLE", "VECINDARIO", "VEREDA", "VIA", "VIAL", "ZOKO", "ZONA", "ZULO", "DESCONOCIDO", "POLIGONO"];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Sin acentos ni ñ, en mayúsculas: así están escritos los valores de los desplegables oficiales.
export const sinAcentos = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N").toUpperCase().trim();

// «Madrid, a 8 de septiembre de 2026» → la Sede solo imprime la parte «a 8 de … de 2026».
export function fechaLarga052(d = new Date()): string {
  return `a ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// «C/ Mallorca 245, 3º 2ª» → tipo de vía / vía / número / piso, con el tipo de vía llevado
// al desplegable oficial (CALLE, AVENIDA, PLAZA, PASEO…). Todo editable en el modal.
export function partirDomicilio052(d: string) {
  const s = String(d ?? "").trim();
  const numero = (s.match(/\b(\d{1,3})\b/) || [])[1] ?? "";
  const piso = (s.match(/(\d+\s*[ºo]\s*\d*\s*[ªa]?)/i) || [])[1]?.replace(/\s+/g, "") ?? "";
  const m = s.match(/^(c\/|calle|avda?\.?|avenida|av\.|plaza|pza\.?|pl\.|paseo|p[ºo]\.|ronda|rda\.?|camino|carretera|ctra\.?|travesía|travesia|trav\.|rambla|via|vía|urbanización|urb\.)\s*/i);
  const tipoRaw = (m?.[1] ?? "").toLowerCase().replace(/\.$/, "");
  const tipo = /^(c\/|calle)$/.test(tipoRaw) ? "CALLE" : /^(avda?|avenida|av)$/.test(tipoRaw) ? "AVENIDA" : /^(plaza|pza|pl)$/.test(tipoRaw) ? "PLAZA"
    : /^(paseo|pº|po)$/.test(tipoRaw) ? "PASEO" : /^(ronda|rda)$/.test(tipoRaw) ? "RONDA" : tipoRaw === "camino" ? "CAMINO" : /^(carretera|ctra)$/.test(tipoRaw) ? "CARRETERA"
    : /^(travesía|travesia|trav)$/.test(tipoRaw) ? "TRAVESIA" : tipoRaw === "rambla" ? "RAMBLA" : /^(via|vía)$/.test(tipoRaw) ? "VIA" : /^(urbanización|urb)$/.test(tipoRaw) ? "URBANIZACION" : tipoRaw ? "" : "CALLE";
  const via = s.replace(m?.[0] ?? "", "").replace(/,?\s*\d+\s*[ºo].*$/i, "").replace(/\b\d{1,3}\b\s*$/, "").replace(/[,.]\s*$/, "").trim();
  return { tipoVia: tipo, via, numero, piso };
}

// Código INE de la provincia a partir del nombre (acentos y artículos aparte) o del C.P.
export function codigoProvincia(nombre?: string | null, cp?: string | null): string {
  const n = sinAcentos(nombre ?? "");
  if (n) {
    const hit = PROVINCIAS_052.find(([, nom]) => sinAcentos(nom) === n)
      ?? PROVINCIAS_052.find(([, nom]) => n.includes(sinAcentos(nom)) || sinAcentos(nom).includes(n));
    if (hit) return hit[0];
  }
  const c = String(cp ?? "").replace(/\D/g, "");
  if (c.length === 5 && PROVINCIAS_052.some(([id]) => id === c.slice(0, 2))) return c.slice(0, 2);
  return "";
}

// ── Lectura del formulario oficial ─────────────────────────────────────────────────
export type Epigrafe052 = { id: string; codigo: string; label: string; importe: string; seccion: string; porDia?: string };
export type Formulario052 = {
  justificante: string;
  epigrafes: Epigrafe052[];
  nacionalidades: string[];
  provinciasDom: string[]; // nombres tal como los espera Ctrl_ProvinciaDom
  reglamento: string;
};

const entidades = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const texto = (html: string) => entidades(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Mapa de provincias de prepareProvincia: <area … onclick="confirmarProvincia('prepareTasa?…idProvincia=15','A Coruña')">.
export function parseProvincias(html: string): { id: string; nombre: string }[] {
  const out: { id: string; nombre: string }[] = [];
  for (const m of html.matchAll(/idProvincia=(\d{2})[^']*','([^']+)'/g)) if (!out.some((p) => p.id === m[1])) out.push({ id: m[1], nombre: entidades(m[2]).trim() });
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function parseFormulario052(html: string): Formulario052 {
  const justificante = (html.match(/name="Ctrl_NumJustificante"[^>]*value="(\d+)"/) || html.match(/value="(\d{13})"[^>]*name="Ctrl_NumJustificante"/) || [])[1] ?? "";
  const reglamento = (html.match(/name="reglamento"[^>]*value="([^"]*)"/) || [])[1] ?? "";
  // Secciones «1.1 → título» para dar contexto a cada epígrafe.
  const secciones: Record<string, string> = {};
  for (const m of html.matchAll(/<TD class="normalgrande(?:negrita)? bordeContenidoRight"[^>]*>\s*([\d.]+)\s*<\/TD>\s*<TD[^>]*>\s*([^<]+?)\s*<\/TD>/gi)) secciones[m[1]] = texto(m[2]);
  const epigrafes: Epigrafe052[] = [];
  for (const m of html.matchAll(/<label for="(epigrafe([\d.]+))">([\s\S]*?)<\/label>[\s\S]*?<input[^>]*name="\1"[^>]*>[\s\S]*?<TD class="normal bordeContenidoRight"[^>]*>\s*([\d.,]+)\s*<\/TD>/gi)) {
    const codigo = m[2];
    const porDia = (m[3].match(/name="Ctrl_Importe052_[\d_]+"[^>]*value="([\d,]+)"/) || [])[1];
    const padre = codigo.split(".").slice(0, 2).join(".");
    epigrafes.push({ id: m[1], codigo, label: texto(m[3]), importe: m[4], seccion: secciones[padre] ?? "", ...(porDia ? { porDia } : {}) });
  }
  // Epígrafes sin <label> (2.4.1, 2.6.1, 2.7.1): el título de su sección es su descripción.
  for (const m of html.matchAll(/<input[^>]*name="(epigrafe([\d.]+))"[^>]*>[\s\S]{0,400}?<TD class="normal bordeContenidoRight"[^>]*>\s*([\d.,]+)\s*<\/TD>/gi)) {
    if (epigrafes.some((e) => e.id === m[1])) continue;
    const codigo = m[2]; const padre = codigo.split(".").slice(0, 2).join(".");
    epigrafes.push({ id: m[1], codigo, label: secciones[padre] ?? codigo, importe: m[3], seccion: secciones[padre] ?? "" });
  }
  epigrafes.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const selNac = html.match(/<select[^>]*name="Ctrl_SelNacionalidad"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const nacionalidades = [...selNac.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => entidades(m[1])).filter(Boolean);
  const provinciasDom = [...html.matchAll(/nombre_provincias\[\d+\]\s*=\s*"([^"]*)"/g)].map((m) => entidades(m[1]));
  return { justificante, epigrafes, nacionalidades, provinciasDom, reglamento };
}

// Cuerpo application/x-www-form-urlencoded en ISO-8859-1 (lo que espera la Sede).
export function cuerpoLatin1(campos: Record<string, string>): string {
  const enc = (v: string) => {
    let out = "";
    for (const ch of v) {
      const code = ch.codePointAt(0) ?? 63;
      const b = code > 255 ? 63 : code; // fuera de latin-1 → «?»
      if (b === 32) out += "+";
      else if ((b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b === 45 || b === 46 || b === 95 || b === 42) out += String.fromCharCode(b);
      else out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
    return out;
  };
  return Object.entries(campos).map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`).join("&");
}

export const decodificarLatin1 = (buf: ArrayBuffer) => new TextDecoder("iso-8859-1").decode(buf);

// Importe total: base del epígrafe (+ días × importe/día en la prórroga de estancia sin
// visado, 1.2.1: días = caducidad − efectos + 1, como calcula la propia Sede).
export function importe052(e: Epigrafe052 | undefined, fechaEfectos?: string, fechaCaducidad?: string): { euros: string; centimos: string; total: string } | null {
  if (!e) return null;
  const aNum = (s: string) => Number(String(s).replace(/\./g, "").replace(",", "."));
  let total = aNum(e.importe);
  if (e.porDia) {
    const a = fechaEfectos ? new Date(fechaEfectos) : null, b = fechaCaducidad ? new Date(fechaCaducidad) : null;
    if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b.getTime() <= a.getTime()) return null;
    const dias = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
    total += aNum(e.porDia) * dias;
  }
  const cent = Math.round(total * 100);
  return { euros: String(Math.floor(cent / 100)), centimos: String(cent % 100).padStart(2, "0"), total: (cent / 100).toFixed(2).replace(".", ",") };
}
