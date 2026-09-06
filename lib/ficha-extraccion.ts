// Ficha de cliente a partir de los campos que lee la IA en un documento de identidad
// (lib/extraction.ts: pares {label, value}). Puro y testado: lo usa la creación de un
// cliente nuevo desde un email reenviado (06/09/2026) y puede usarlo cualquier entrada.
export type FichaNueva = {
  nombre?: string; apellidos?: string; sexo?: "H" | "M"; nacionalidad?: string; fechaNacimiento?: string;
  lugarNacimiento?: string; paisNacimiento?: string; numeroDocumento?: string; pasaporte?: string;
  via?: string; municipio?: string; provincia?: string; codigoPostal?: string;
};
const IDENTIDAD = new Set(["pasaporte", "tarjeta_residencia_tie", "nie", "dni", "documento_identidad", "cedula", "tarjeta_identidad"]);
export const esDocumentoDeIdentidad = (tipoDetectado: string | null | undefined): boolean => IDENTIDAD.has(String(tipoDetectado ?? "").toLowerCase());

const limpiar = (v: string | null | undefined) => String(v ?? "").replace(/\s+/g, " ").trim();
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());

// Fechas de pasaporte/TIE: 14/03/1992 · 14-03-1992 · 1992-03-14 · 14 MAR 1992 · 14.03.1992
const MESES: Record<string, string> = { ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04", may: "05", jun: "06", jul: "07", ago: "08", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dic: "12", dec: "12" };
export function fechaISO(v: string | null | undefined): string | undefined {
  const s = limpiar(v).toLowerCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return s;
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})$/.exec(s); if (m && MESES[m[2]]) return `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, "0")}`;
  return undefined;
}
// Sexo: la ficha usa H (hombre) / M (mujer); un pasaporte trae M/F (ICAO), donde M es varón.
export function sexoFicha(v: string | null | undefined): "H" | "M" | undefined {
  const s = limpiar(v).toLowerCase();
  if (!s) return undefined;
  if (/^(f|fem|femenino|mujer|female|w)$/.test(s) || /^(fem|muj)/.test(s)) return "M";
  if (/^(m|h|masc|masculino|hombre|male|var[oó]n)$/.test(s) || /^(masc|hom|var)/.test(s)) return "H";
  return undefined;
}
export function fichaDesdeCampos(campos: { label: string; value: string }[]): FichaNueva {
  const get = (...labels: string[]) => { for (const l of labels) { const c = campos.find((x) => x.label.toLowerCase() === l.toLowerCase()); const v = limpiar(c?.value); if (v && !/^(n\/?a|-|—|null|desconocido)$/i.test(v)) return v; } return undefined; };
  const f: FichaNueva = {};
  let nombre = get("Nombre"), apellidos = get("Apellidos");
  const completo = get("Nombre completo");
  if ((!nombre || !apellidos) && completo) { const partes = completo.split(" "); if (!nombre && !apellidos && partes.length >= 2) { nombre = partes[0]; apellidos = partes.slice(1).join(" "); } else if (!apellidos && nombre && partes.length > 1) apellidos = partes.filter((p) => p.toLowerCase() !== nombre!.toLowerCase()).join(" "); }
  if (nombre) f.nombre = titulo(nombre); if (apellidos) f.apellidos = titulo(apellidos);
  const sexo = sexoFicha(get("Sexo")); if (sexo) f.sexo = sexo;
  const nac = get("Nacionalidad"); if (nac) f.nacionalidad = titulo(nac);
  const fn = fechaISO(get("Fecha de nacimiento")); if (fn) f.fechaNacimiento = fn;
  const ln = get("Lugar de nacimiento"); if (ln) f.lugarNacimiento = titulo(ln);
  const pais = get("País"); if (pais) f.paisNacimiento = titulo(pais); else if (nac) f.paisNacimiento = titulo(nac);
  const nie = get("NIE"); if (nie && /^[XYZ]\d{7}[A-Z]$/i.test(nie.replace(/[\s-]/g, ""))) f.numeroDocumento = nie.replace(/[\s-]/g, "").toUpperCase();
  const pas = get("Nº pasaporte", "Nº documento"); if (pas && !/^[XYZ]\d{7}[A-Z]$/i.test(pas.replace(/[\s-]/g, ""))) f.pasaporte = pas.replace(/\s/g, "").toUpperCase();
  const via = get("Dirección"); if (via) f.via = via;
  const mun = get("Municipio"); if (mun) f.municipio = titulo(mun);
  const prov = get("Provincia"); if (prov) f.provincia = titulo(prov);
  const cp = get("Código postal"); if (cp && /^\d{5}$/.test(cp)) f.codigoPostal = cp;
  return f;
}
// «Es nuevo», «cliente nuevo», «créalo», «no lo tengo» → el gestor pide crear el cliente.
export function pideClienteNuevo(texto: string | null | undefined): boolean {
  return /\b(cliente\s+nuevo|es\s+nuev[oa]|nuev[oa]\s+cliente|cr[eé]alo|cr[eé]ala|crear(lo|la)?|no\s+lo\s+tengo|no\s+existe)\b/i.test(texto ?? "");
}
// Nombre escrito por el gestor en su respuesta («Es nuevo: Daniel Ramírez Soto»): las
// palabras con mayúscula que quedan tras quitar las de la orden.
export function nombreEscrito(texto: string | null | undefined): { nombre: string; apellidos: string } | null {
  const t = (texto ?? "").replace(/\b(cliente|nuevo|nueva|es|de|el|la|crear|cr[eé]alo|cr[eé]ala|por favor|gracias|hola|buenas|documentos?|pasaporte|nie)\b/gi, " ").replace(/[:,.;]/g, " ");
  const palabras = t.split(/\s+/).filter((p) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü'-]+$/.test(p));
  if (palabras.length < 2) return null;
  return { nombre: palabras[0], apellidos: palabras.slice(1).join(" ") };
}
