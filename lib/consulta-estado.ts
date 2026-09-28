import { faltaParaConsultar } from "@/lib/numero-oficial";

// CONSULTA DEL ESTADO POR EL PROPIO CLIENTE (28/09/2026, pedido de Jennifer / GESADM: su
// «Guía para clientes» en PDF, hecha pantalla y con los datos de cada cliente ya puestos).
// Una vez presentado el expediente, el seguimiento del cliente (/s/[token]) le da SUS datos
// para la consulta oficial, el enlace y el SMS gratuito ya escrito.
//
// Fuente: sede.administracionespublicas.gob.es/pagina/index/directorio/infoext2 (leída el
// 28/09/2026): NIE o nº de expediente + fecha de presentación + año de nacimiento + captcha;
// SMS gratuito al 651 714 610 con «NIE X00000111L» (8 dígitos: se rellena con ceros a la
// izquierda) o «EXPE» + exactamente 15 caracteres; teléfono 902 02 22 22; el servicio NO
// está disponible para ciudadanos de la Unión Europea.

export const INFOEXT2_ACCESO = "https://infoext2.delegaciondelgobierno.gob.es/infoext2/";
export const SMS_INFOEXT = "651714610";
export const SMS_INFOEXT_LEGIBLE = "651 714 610";
export const TELEFONO_INFOEXT = "902 02 22 22";

export type DatosConsulta = {
  nie: string;               // NIE tal cual (X1234567L) o "" si no hay uno válido
  numeroExpediente: string;  // nº que asigna Extranjería o ""
  fechaPresentacion: string; // AAAA-MM-DD
  anioNacimiento: string;    // AAAA
  sms: string | null;        // cuerpo del SMS listo («NIE X01234567L» / «EXPE …») o null
};

const NIE_RE = /^([XYZ])(\d{7,8})([A-Z])$/;
const limpiarNie = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

// El SMS oficial quiere el NIE con 8 dígitos: X1234567L → X01234567L.
export function nieParaSms(nie: string | null | undefined): string | null {
  const m = NIE_RE.exec(limpiarNie(nie ?? ""));
  return m ? `${m[1]}${m[2].padStart(8, "0")}${m[3]}` : null;
}

// «EXPE» solo vale con exactamente 15 caracteres (p. ej. 280020101234567); un número con
// barras (08/203456/2026) no sirve por SMS: entonces no se ofrece.
export function expeParaSms(numero: string | null | undefined): string | null {
  const limpio = (numero ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return limpio.length === 15 ? limpio : null;
}

// UE, EEE y Suiza: la consulta oficial no es para ellos. Nombres de país, gentilicios y
// códigos ISO (lo que traen la ficha o la lectura del pasaporte).
const UE_TEXTO = /\b(alemania|aleman[ae]?s?|austria(c[oa]s?)?|belg(a|as|ica)|bulgari?[ao]s?|chipr(e|iot[ao]s?)|croa(cia|t[ao]s?)|dinamarca|danes(a|es|as)?|eslova(quia|c[oa]s?)|esloven(ia|[oa]s?)|espan(a|ol|ola|oles|olas)|estoni(a|o|as|os)?|finland(ia|es|esa|eses|esas)|franc(ia|es|esa|eses|esas)|grecia|grieg[oa]s?|hungr(ia)?|hungar[oa]s?|irland(a|es|esa|eses|esas)|itali(a|an[oa]s?)|leton(ia|[ae]s|a)?|lituan(ia|[oa]s?)|luxemburg(o|ues|uesa)|malt(a|es|esa)|paises bajos|holand(a|es|esa)|neerlandes(a)?|polon(ia)|polac[oa]s?|portugal|portugues(a|es|as)?|chequia|republica checa|chec[oa]s?|ruman(ia|[oa]s?)|suecia|suec[oa]s?|norueg(a|o|as|os)|island(ia|es|esa)|liechtenstein|suiz(a|o|as|os))\b/;
const UE_ISO = new Set(["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "D", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "ISL", "LIE", "NOR", "CHE"]);
export function esCiudadanoUE(nacionalidad: string | null | undefined): boolean {
  const v = (nacionalidad ?? "").trim();
  if (!v) return false;
  if (UE_ISO.has(v.toUpperCase())) return true;
  return UE_TEXTO.test(v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
}

// Los datos para la tarjeta del cliente, o null si no hay que enseñarla: ciudadano de la
// UE o falta algo de lo que la web oficial pide (mejor nada que una guía que no funciona).
export function datosConsultaCliente(x: {
  nie?: string | null; numeroOficial?: string | null; fechaPresentacion?: string | null;
  fechaNacimiento?: string | null; nacionalidad?: string | null;
}): DatosConsulta | null {
  if (esCiudadanoUE(x.nacionalidad)) return null;
  const nieSms = nieParaSms(x.nie);
  const nie = nieSms ? limpiarNie(x.nie ?? "") : "";
  const numeroExpediente = (x.numeroOficial ?? "").trim();
  const fechaPresentacion = (x.fechaPresentacion ?? "").slice(0, 10);
  const anioNacimiento = /^\d{4}/.test(x.fechaNacimiento ?? "") ? (x.fechaNacimiento ?? "").slice(0, 4) : "";
  if (faltaParaConsultar({ nie, numeroOficial: numeroExpediente, fechaPresentacion, fechaNacimiento: anioNacimiento }).length) return null;
  const expe = expeParaSms(numeroExpediente);
  return { nie, numeroExpediente, fechaPresentacion, anioNacimiento, sms: nieSms ? `NIE ${nieSms}` : expe ? `EXPE ${expe}` : null };
}

// Día de presentación en hora de Madrid (AAAA-MM-DD). La columna y los eventos guardan UTC
// (a veces sin «Z»): un depósito a las 00:30 de Madrid es el día anterior en UTC.
export function diaMadrid(v: string | null | undefined): string {
  const x = (v ?? "").trim();
  if (!x) return "";
  if (!x.includes("T") && !x.includes(" ")) return x.slice(0, 10);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(x) ? x : x.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? x.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// Fecha para la pantalla y para el formulario oficial: dd/mm/aaaa.
export const fechaDMA = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

// Enlace sms: que abre la app de mensajes con el texto puesto (iOS y Android aceptan «?&body=»).
export const enlaceSms = (cuerpo: string): string => `sms:${SMS_INFOEXT}?&body=${encodeURIComponent(cuerpo)}`;
