// TEMAS DEL CATÁLOGO — la carpeta de primer nivel de Expedientes (y del portal).
//
// Medido en producción el 19/09/2026: de 17 despachos, solo 2 habían escrito un tema;
// Juan tiene 40 servicios y NINGUNO con tema, así que su pantalla nacía con 18 carpetas
// raíz (8 de ellas con un solo expediente). El tema no puede depender de que el gestor
// rellene un campo libre que nadie rellena: se PROPONE solo y él lo corrige en Ajustes.
//
//   1. clave del catálogo (arraigo_social, nacionalidad…) → tema fijo;
//   2. servicio propio del despacho (srv_…) → se deduce de su nombre;
//   3. nada reconocible → sin tema («Otros trámites», al final del árbol).

import { normTema } from "@/lib/servicios";

export const TEMAS_SUGERIDOS = ["Residencia", "Arraigo", "Familia", "Nacionalidad", "Trabajo", "Estudios", "Recursos", "Visados"] as const;

// Claves del catálogo de Aproba (lib/servicios.ts): tema fijo, no se adivina.
export const TEMA_POR_CLAVE: Record<string, string> = {
  arraigo_social: "Arraigo",
  arraigo_laboral: "Arraigo",
  renovacion_tie: "Residencia",
  larga_duracion: "Residencia",
  nie: "Residencia",
  residencia_ue: "Residencia",
  brexit: "Residencia",
  modificacion: "Residencia",
  reagrupacion: "Familia",
  nacionalidad: "Nacionalidad",
  movilidad_internacional: "Trabajo",
};

// El ORDEN manda: «Prórroga de estancia de estudios» es Estudios, no Residencia, y
// «Modificación de estancia por estudios a residencia» es Residencia (lo que resulta).
const REGLAS: [string, RegExp][] = [
  ["Arraigo", /\barraigo/],
  ["Nacionalidad", /nacionalidad|jura\b|carta de naturaleza/],
  ["Recursos", /recurso|reposicion|alzada|requerimiento|alegacion|contencioso/],
  ["Residencia", /modificacion|autorizacion de regreso|larga duracion|arraigo a residencia/],
  ["Estudios", /estudio|estudiante|homologacion|equivalencia|titulo|bachiller|universitari|practicas|beca/],
  ["Familia", /reagrupacion|familiar|pareja de hecho|matrimonio|casamiento|libro de familia|menor\b|hijo/],
  ["Trabajo", /trabajo|trabajador|cuenta ajena|cuenta propia|autonomo|nomada|altamente cualificad|\buge\b|ley ?14|intraempresarial|emprendedor|inversor|investigador|temporada|empleada de hogar/],
  ["Visados", /visado|carta de invitacion|invitacion/],
  ["Residencia", /residencia|\btie\b|\bnie\b|\bcue\b|estancia|tarjeta|permiso|prorroga|renovacion|comunitari|\bue\b/],
];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Tema propuesto para un servicio. `clave` manda sobre el nombre (una clave del catálogo
// es inequívoca); el nombre solo decide en los servicios propios del despacho.
export function temaSugerido(clave: string | null | undefined, label: string | null | undefined): string | null {
  const k = (clave ?? "").trim();
  if (k && TEMA_POR_CLAVE[k]) return TEMA_POR_CLAVE[k];
  const txt = sinAcentos((label ?? "").trim());
  if (!txt) return null;
  for (const [tema, re] of REGLAS) if (re.test(txt)) return tema;
  return null;
}

// Tema EFECTIVO de un servicio: la carpeta en la que está manda siempre.
//
// `hayCarpetas` = el despacho ya organizó su catálogo en carpetas. Entonces un servicio
// SIN carpeta está sin carpeta a propósito, y deducirle un tema le escondería el
// servicio en una carpeta que él no ha creado (20/09: Matthias veía tres carpetas donde
// tenía cuatro). Sin carpetas todavía, la propuesta sigue siendo útil: es lo que evita
// que un despacho como el de Juan (40 servicios, ningún tema) abra una lista plana.
export function temaEfectivo(categoria: string | null | undefined, clave?: string | null, label?: string | null, hayCarpetas = false): string | null {
  const propio = (categoria ?? "").trim();
  if (propio) return propio;
  return hayCarpetas ? null : temaSugerido(clave, label);
}

// Une las grafías de un mismo tema («ARRAIGO», «Arraigo ») conservando la PRIMERA que
// escribió el despacho, y devuelve la lista en orden de catálogo. Es la misma regla que
// el portal del cliente (agruparPorTema), que el árbol no respetaba.
export function unificarTemas(temas: (string | null | undefined)[]): { lista: string[]; canon: Map<string, string> } {
  const canon = new Map<string, string>();
  const lista: string[] = [];
  for (const t of temas) {
    const v = (t ?? "").trim();
    if (!v) continue;
    const k = normTema(v);
    if (canon.has(k)) continue;
    canon.set(k, v);
    lista.push(v);
  }
  return { lista, canon };
}
