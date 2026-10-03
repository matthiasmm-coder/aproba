import { normalizarEstado, type Estado5, type FaseKey } from "@/lib/progreso";

// VISTA TABLA de Expedientes (23/09/2026, petición de Jennifer; retirada el 24/09 y
// RESTAURADA el 28/09: «está organizada como ella quiere»). Tipo y reglas PURAS, compartidas por la ruta que sirve las filas y el componente que
// las pinta. Una fila = lo que su Excel llevaba, construido SOLO con lo que Aproba guarda.
// El nº oficial (normalizar, qué falta para consultar) vive en lib/numero-oficial.ts.

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
  // Fase del tablero (en curso): formularios o tasa generados, o «Marcar como preparado».
  // La ruta no la calcula; la lista la añade cruzando por id con sus expedientes.
  preparado?: boolean;
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

// ── Estado del trámite y resolución, en palabras (pantalla y CSV) ─────────────────────
// «Preparado» no es un estado guardado: es la fase del tablero. La tabla y el filtro de la
// lista lo enseñan para lo que aún no se ha presentado (Jennifer, 03/10/2026: «no veo los
// estados en preparación y preparado»).
export type EstadoVisible = Estado5 | "PREPARADO";
export function estadoVisibleDe(estado: string | null | undefined, fase: FaseKey | null | undefined): EstadoVisible {
  const e = normalizarEstado(estado);
  return e === "EN_PREPARACION" && fase === "preparado" ? "PREPARADO" : e;
}
export const estadoVisible = (f: Pick<FilaTabla, "estado" | "preparado">): EstadoVisible =>
  estadoVisibleDe(f.estado, f.preparado ? "preparado" : "preparacion");
export const ESTADO_TRAMITE: Record<EstadoVisible, string> = {
  EN_PREPARACION: "En preparación",
  PREPARADO: "Preparado",
  PRESENTADO: "Presentado",
  RESUELTO: "Resuelto",
  RECHAZADO: "Resuelto",
  FINALIZADO: "Finalizado",
};
// Filtro «Estado» de la lista (las dos presentaciones): una clave por etiqueta visible.
export const FILTRO_ESTADO = ["EN_PREPARACION", "PREPARADO", "PRESENTADO", "RESUELTO", "FINALIZADO"] as const;
export type FiltroEstado = (typeof FILTRO_ESTADO)[number];
export const claveFiltroEstado = (v: EstadoVisible): FiltroEstado => (v === "RECHAZADO" ? "RESUELTO" : v);
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
    f.nombre, f.nie || f.pasaporte, f.numeroOficial, f.anio, fechaCsv(f.fechaNacimiento), ESTADO_TRAMITE[estadoVisible(f)],
    fechaCsv(f.fechaPresentacion), f.tramitadoPor, "", resolucionDe(f.estado), f.tasaGenerada ? "Generada" : "", f.referencia,
  ]);
  return "\uFEFF" + [cabecera, ...lineas].map((l) => l.map((v) => esc(String(v ?? ""))).join(";")).join("\n");
}
