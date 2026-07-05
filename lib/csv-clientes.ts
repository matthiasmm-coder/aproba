// Parsing CSV des clients — FICHE COMPLÈTE, source unique partagée par l'onboarding et
// /app/clientes/nuevo (mêmes colonnes que le portail « Tus datos », via lib/ficha.ts).
// Séparateur ; ou , · guillemets · BOM Excel · en-têtes tolérants (es/en/fr). Les colonnes
// absentes restent vides → null en base (jamais bloquant). Pour ajouter un champ : il suffit
// d'ajouter son alias d'en-tête dans CABECERAS — la fiche elle-même est lib/ficha.ts.

import { FICHA_KEYS, fichaVacia, type ClienteFicha } from "@/lib/ficha";

export type ClienteCsvCampos = Record<keyof ClienteFicha, string> & { idioma: string; fechaCaducidad: string };
export type FilaCsv = ClienteCsvCampos & { estado: "ok" | "duplicado" | "sin_nombre" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const camposVacios = (): ClienteCsvCampos => ({ ...(fichaVacia() as Record<keyof ClienteFicha, string>), idioma: "es", fechaCaducidad: "" });

// Fecha de caducidad del CSV → ISO AAAA-MM-DD. Acepta dd/mm/aaaa (formato español,
// también con - o .) y AAAA-MM-DD. Inválida/ausente → "" (nunca bloquea la fila).
// Validación ESTRICTA por ida-y-vuelta: Date.parse «rueda» el 31/02 al 3 de marzo.
const fechaReal = (y: number, mo: number, d: number): boolean => {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};
export function normalizarFechaCsv(v: string): string {
  const s = v.trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return fechaReal(+m[1], +m[2], +m[3]) ? s : "";
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    if (!fechaReal(+y, +mo, +d)) return "";
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

export function parseCSV(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM Excel
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// En-têtes reconnus (insensible aux accents/majuscules) → fiche complète.
export const CABECERAS: Partial<Record<keyof ClienteCsvCampos, string[]>> = {
  nombre: ["nombre", "name", "prenom"],
  apellidos: ["apellidos", "apellido", "surname", "nom"],
  email: ["email", "correo", "mail"],
  telefono: ["telefono", "tel", "movil", "phone", "telephone"],
  nacionalidad: ["nacionalidad", "nationalite"],
  numeroDocumento: ["documento", "numerodocumento", "ndocumento", "nie", "pasaporte", "dni", "passport"],
  sexo: ["sexo", "sex", "genero"],
  fechaNacimiento: ["fechanacimiento", "nacimiento", "fechadenacimiento", "birth", "birthdate"],
  lugarNacimiento: ["lugarnacimiento", "lugardenacimiento", "ciudadnacimiento"],
  paisNacimiento: ["paisnacimiento", "paisdenacimiento"],
  estadoCivil: ["estadocivil", "civil"],
  via: ["via", "domicilio", "direccion", "calle", "address"],
  numeroVia: ["numero", "numerovia", "num"],
  piso: ["piso", "puerta"],
  codigoPostal: ["codigopostal", "cp", "zip"],
  municipio: ["municipio", "localidad", "ciudad", "city"],
  provincia: ["provincia", "province"],
  idioma: ["idioma", "lengua", "language", "langue"],
  // Vigía: la caducidad de la TIE actual → siembra el radar de vencimientos al importar.
  fechaCaducidad: ["caducidad", "fechacaducidad", "caducidadtie", "fechacaducidadtie", "vencimiento", "vencimientotie", "expiry", "expiration", "expira"],
};

// Étiquette des colonnes reconnues (affichée dans les deux écrans d'import).
export const COLUMNAS_CSV_LABEL = "nombre*, apellidos, email, telefono, nacionalidad, documento, sexo, fechaNacimiento, estadoCivil, via, numero, codigoPostal, municipio, provincia, idioma, caducidadTIE";

// Clés de doublon (email / nombre+apellidos) à partir des clients déjà en base.
export function llavesDeClientes(existentes: { nombre: string | null; apellidos?: string | null; email?: string | null }[]): Set<string> {
  const s = new Set<string>();
  for (const c of existentes) {
    if (c.email) s.add("e:" + norm(c.email));
    s.add("n:" + norm(`${c.nombre ?? ""} ${c.apellidos ?? ""}`));
  }
  return s;
}

// Parse un CSV → lignes (fiche complète) typées. `existentesLlaves` marque les doublons
// (vide en onboarding). Lève si pas de colonne "nombre".
export function parseClientesCsv(text: string, existentesLlaves: Set<string> = new Set()): FilaCsv[] {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("El CSV está vacío (cabeceras + datos).");
  const headers = rows[0].map(norm);
  const campos = Object.keys(CABECERAS) as (keyof ClienteCsvCampos)[];
  const idx: Partial<Record<keyof ClienteCsvCampos, number>> = {};
  campos.forEach((campo) => {
    const i = headers.findIndex((h) => CABECERAS[campo]!.includes(h.replace(/[^a-z]/g, "")));
    if (i >= 0) idx[campo] = i;
  });
  if (idx.nombre === undefined) throw new Error('No se encontró la columna "nombre". Descarga la plantilla.');

  const llaves = new Set(existentesLlaves);
  return rows.slice(1).map((r) => {
    const get = (k: keyof ClienteCsvCampos) => (idx[k] !== undefined ? (r[idx[k]!] ?? "").trim() : "");
    const f = camposVacios();
    campos.forEach((k) => { const v = get(k); if (v) f[k] = v; });
    f.idioma = get("idioma") || "es";
    f.fechaCaducidad = normalizarFechaCsv(f.fechaCaducidad); // dd/mm/aaaa → ISO; inválida → ""
    let estado: FilaCsv["estado"] = "ok";
    if (!f.nombre) estado = "sin_nombre";
    else if ((f.email && llaves.has("e:" + norm(f.email))) || llaves.has("n:" + norm(`${f.nombre} ${f.apellidos}`))) estado = "duplicado";
    else llaves.add("n:" + norm(`${f.nombre} ${f.apellidos}`)); // dédoublonne aussi à l'intérieur du fichier
    return { ...f, estado };
  });
}

// Ligne Cliente (colonnes plates) depuis la fiche CSV ou le formulaire manuel. nombre
// obligatoire, reste null si vide. Écrit les MÊMES colonnes que le portail.
export function filaACliente(f: ClienteCsvCampos, workspaceId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { id: crypto.randomUUID(), workspaceId, idioma: f.idioma || "es", updatedAt: new Date().toISOString() };
  for (const k of FICHA_KEYS) { const v = (f[k] ?? "").trim(); row[k] = k === "nombre" ? v : (v || null); }
  // Vigía: caducidad de la TIE (ya normalizada a ISO por parseClientesCsv).
  if (f.fechaCaducidad) { row.fechaCaducidad = f.fechaCaducidad; row.tipoVencimiento = "TIE"; }
  return row;
}

export const PLANTILLA_CSV =
  "﻿nombre;apellidos;email;telefono;nacionalidad;documento;sexo;fechaNacimiento;estadoCivil;via;numero;codigoPostal;municipio;provincia;idioma;caducidadTIE\n"
  + "Julia;Mendoza Restrepo;julia@email.com;612345678;Colombia;AY0429317;M;1990-05-12;C;Calle Mayor;23;28013;Madrid;Madrid;es;15/07/2027\n";
