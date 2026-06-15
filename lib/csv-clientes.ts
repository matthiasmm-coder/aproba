// Parsing CSV des clients (réutilisé par l'onboarding et /app/clientes/nuevo).
// Séparateur ; ou , · guillemets · BOM Excel · en-têtes tolérants (es/en/fr).

export type ClienteCsv = {
  nombre: string; apellidos: string; email: string; telefono: string;
  nacionalidad: string; numeroDocumento: string; idioma: string;
};

export type FilaCsv = ClienteCsv & { estado: "ok" | "duplicado" | "sin_nombre" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function parseCSV(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
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

const CABECERAS: Record<keyof ClienteCsv, string[]> = {
  nombre: ["nombre", "name", "prenom"],
  apellidos: ["apellidos", "apellido", "surname", "nom"],
  email: ["email", "correo", "email", "mail"],
  telefono: ["telefono", "tel", "movil", "phone", "telephone"],
  nacionalidad: ["nacionalidad", "pais", "country", "nationalite"],
  numeroDocumento: ["documento", "numerodocumento", "ndocumento", "nie", "pasaporte", "dni", "passport"],
  idioma: ["idioma", "lengua", "language", "langue"],
};

// Parse un CSV → lignes typées. `existentesLlaves` = clés (email/nombre) déjà en base
// pour marquer les doublons (vide en onboarding). Lève si pas de colonne "nombre".
export function parseClientesCsv(text: string, existentesLlaves: Set<string> = new Set()): FilaCsv[] {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("El CSV está vacío (cabeceras + datos).");
  const headers = rows[0].map(norm);
  const idx: Partial<Record<keyof ClienteCsv, number>> = {};
  (Object.keys(CABECERAS) as (keyof ClienteCsv)[]).forEach((campo) => {
    const i = headers.findIndex((h) => CABECERAS[campo].includes(h.replace(/[^a-z]/g, "")));
    if (i >= 0) idx[campo] = i;
  });
  if (idx.nombre === undefined) throw new Error('No se encontró la columna "nombre". Descarga la plantilla.');

  const llaves = new Set(existentesLlaves);
  return rows.slice(1).map((r) => {
    const get = (k: keyof ClienteCsv) => (idx[k] !== undefined ? (r[idx[k]!] ?? "").trim() : "");
    const f: ClienteCsv = {
      nombre: get("nombre"), apellidos: get("apellidos"), email: get("email"), telefono: get("telefono"),
      nacionalidad: get("nacionalidad"), numeroDocumento: get("numeroDocumento"), idioma: get("idioma") || "es",
    };
    let estado: FilaCsv["estado"] = "ok";
    if (!f.nombre) estado = "sin_nombre";
    else if ((f.email && llaves.has("e:" + norm(f.email))) || llaves.has("n:" + norm(`${f.nombre} ${f.apellidos}`))) estado = "duplicado";
    else llaves.add("n:" + norm(`${f.nombre} ${f.apellidos}`));
    return { ...f, estado };
  });
}

export const PLANTILLA_CSV = "﻿nombre;apellidos;email;telefono;nacionalidad;documento;idioma\nJulia;Mendoza;julia@email.com;612345678;Colombia;AY0429317;es\n";
