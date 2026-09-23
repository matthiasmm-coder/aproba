import { normalizarEstado, type Estado5 } from "@/lib/progreso";

// VISTA TABLA de Expedientes (PROTOTIPO LOCAL, 23/09/2026 — petición de Jennifer).
// Tipo y reglas PURAS, compartidas por la ruta que sirve las filas y el componente que
// las pinta. Una fila = lo que su Excel llevaba, construido SOLO con lo que Aproba guarda.

export type FilaTabla = {
  id: string;
  referencia: string;
  numeroOficial: string;      // nº que asigna Extranjería ("" = aún no lo tiene)
  nombre: string;
  nie: string;
  pasaporte: string;
  anio: string;               // año de la banda: el de presentación; si no, el de cierre; si no, el de alta
  fechaNacimiento: string;    // AAAA-MM-DD o ""
  estado: Estado5;
  fechaPresentacion: string;  // ISO o ""
  tramitadoPor: string;
  tasaGenerada: boolean;
  archivado: boolean;
};

type Uno<T> = T | T[] | null | undefined;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export type RowTabla = {
  id: string; referencia: string; numeroOficial?: string | null; estado: string; fechaPresentacion: string | null; createdAt: string; archivadoAt: string | null; tasaPath: string | null;
  cliente: Uno<{ nombre: string | null; apellidos: string | null; numeroDocumento: string | null; pasaporte: string | null; fechaNacimiento: string | null }>;
  empresa: Uno<{ razonSocial: string | null }>;
  asignadoA: Uno<{ nombre: string | null }>;
};

export const SELECT_TABLA = "id, referencia, numeroOficial, estado, fechaPresentacion, createdAt, archivadoAt, tasaPath, oficinaId, cliente:Cliente(nombre, apellidos, numeroDocumento, pasaporte, fechaNacimiento), empresa:Empresa(razonSocial), asignadoA:User(nombre)";

// El año que recuerda el gestor: el de PRESENTACIÓN («la nacionalidad de 2023»). Sin
// presentación, el del cierre si está archivado; si no, el del alta.
export function filaTabla(r: RowTabla): FilaTabla {
  const c = uno(r.cliente), em = uno(r.empresa), as = uno(r.asignadoA);
  const fechaRef = r.fechaPresentacion ?? r.archivadoAt ?? r.createdAt ?? "";
  return {
    id: r.id,
    referencia: r.referencia,
    numeroOficial: r.numeroOficial ?? "",
    // Expediente de empresa (sin persona titular): la fila lleva el nombre de la empresa.
    nombre: c ? `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim() : (em?.razonSocial ?? "").trim(),
    nie: c?.numeroDocumento ?? "",
    pasaporte: c?.pasaporte ?? "",
    anio: fechaRef.slice(0, 4),
    fechaNacimiento: c?.fechaNacimiento ?? "",
    estado: normalizarEstado(r.estado),
    fechaPresentacion: r.fechaPresentacion ?? "",
    tramitadoPor: as?.nombre ?? "",
    tasaGenerada: Boolean(r.tasaPath),
    archivado: Boolean(r.archivadoAt),
  };
}

// ── Nº de expediente OFICIAL (el que asigna Extranjería) ─────────────────────────────
// Texto libre porque el formato cambia por provincia y procedimiento. Se limpia lo
// mínimo para que buscar y comparar funcionen: sin espacios sobrantes y en mayúsculas.
// "" = borrarlo. Máximo 60 caracteres (lo más largo visto ronda los 25).
export const MAX_NUMERO_OFICIAL = 60;
export function normalizarNumeroOficial(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, MAX_NUMERO_OFICIAL);
}

// Lo que la consulta oficial (infoext2) necesita: el NIE O el nº de expediente, más la
// fecha de presentación y el año de nacimiento. Devuelve lo que FALTA (vacío = se puede).
export function faltaParaConsultar(f: Pick<FilaTabla, "nie" | "numeroOficial" | "fechaPresentacion" | "fechaNacimiento">): string[] {
  const faltan: string[] = [];
  if (!f.nie && !f.numeroOficial) faltan.push("NIE o nº de expediente");
  if (!f.fechaPresentacion) faltan.push("fecha de presentación");
  if (!f.fechaNacimiento.slice(0, 4)) faltan.push("año de nacimiento");
  return faltan;
}

// ── Estado del trámite y resolución, en palabras (pantalla y CSV) ─────────────────────
export const ESTADO_TRAMITE: Record<Estado5, string> = {
  EN_PREPARACION: "En preparación",
  PRESENTADO: "Presentado",
  RESUELTO: "Resuelto",
  RECHAZADO: "Resuelto",
  FINALIZADO: "Finalizado",
};
export const resolucionDe = (e: Estado5): string => (e === "RESUELTO" ? "Favorable" : e === "RECHAZADO" ? "No favorable" : "");

const fechaCsv = (iso: string): string => {
  const [a, m, d] = (iso ?? "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

// EXPORTAR LA TABLA (pedido de Matthias, 23/09/2026): Jennifer vive en Excel, y esta vista
// ES su Excel. Se exporta LO QUE SE VE (filas filtradas), con las columnas en el mismo
// orden que la pantalla, para que pueda pegarlo en su hoja de siempre o mandarlo.
// Mismo formato que el resto de exportaciones: «;» (Excel en español), BOM, fechas dd/mm/aaaa.
export function csvTabla(filas: FilaTabla[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cabecera = ["Nombre completo", "NIE", "Nº expediente", "Año", "Fecha de nacimiento", "Estado de trámite", "Fecha de presentación", "Tramitado por", "Colaborador", "Resolución", "Tasa", "Referencia Aproba"];
  const lineas = filas.map((f) => [
    f.nombre, f.nie || f.pasaporte, f.numeroOficial, f.anio, fechaCsv(f.fechaNacimiento), ESTADO_TRAMITE[f.estado],
    fechaCsv(f.fechaPresentacion), f.tramitadoPor, "", resolucionDe(f.estado), f.tasaGenerada ? "Generada" : "", f.referencia,
  ]);
  return "\uFEFF" + [cabecera, ...lineas].map((l) => l.map((v) => esc(String(v ?? ""))).join(";")).join("\n");
}
