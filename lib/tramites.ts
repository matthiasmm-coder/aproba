// Labels des enums Prisma (TipoTramite, DocumentoTipo, FormularioTipo) pour l'UI.
// Source unique — utilisée par les pages branchées sur Supabase.

export const TIPO_LABEL: Record<string, string> = {
  NIE: "Asignación de NIE",
  TIE: "Tarjeta TIE",
  ARRAIGO_SOCIAL: "Arraigo social",
  ARRAIGO_LABORAL: "Arraigo laboral",
  ARRAIGO_FAMILIAR: "Arraigo familiar",
  REAGRUPACION: "Reagrupación familiar",
  RENOVACION: "Renovación TIE",
  RESIDENCIA_LARGA: "Residencia larga duración",
  NACIONALIDAD: "Nacionalidad española",
  OTRO: "Otro trámite",
};

export const DOC_LABEL: Record<string, string> = {
  PASAPORTE: "Pasaporte",
  TARJETA_RESIDENCIA_TIE: "TIE actual",
  CERTIFICADO_NIE: "Certificado NIE",
  EMPADRONAMIENTO: "Certificado de empadronamiento",
  CONTRATO_TRABAJO: "Contrato de trabajo",
  NOMINA: "Nómina",
  ANTECEDENTES_PENALES: "Antecedentes penales",
  CERTIFICADO_BANCARIO: "Certificado bancario",
  LIBRO_FAMILIA: "Libro de familia",
  TITULO_ESTUDIOS: "Título de estudios",
  HOJA_ENCARGO: "Hoja de encargo firmada",
  MANDATO: "Mandato de representación firmado",
  OTRO: "Otro documento",
};

// Libellé libre d'un document requis (config Ajustes) → enum DocumentoTipo.
export function labelADocTipo(label: string): string {
  const n = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.includes("hoja de encargo") || n.includes("encargo")) return "HOJA_ENCARGO";
  if (n.includes("mandato")) return "MANDATO";
  if (n.includes("pasaporte")) return "PASAPORTE";
  if (n.includes("tie")) return "TARJETA_RESIDENCIA_TIE";
  if (n.includes("nie")) return "CERTIFICADO_NIE";
  if (n.includes("empadronamiento")) return "EMPADRONAMIENTO";
  if (n.includes("contrato")) return "CONTRATO_TRABAJO";
  if (n.includes("nomina")) return "NOMINA";
  if (n.includes("antecedentes") || n.includes("vida laboral")) return "ANTECEDENTES_PENALES";
  if (n.includes("bancario") || n.includes("medios economicos") || n.includes("saldo")) return "CERTIFICADO_BANCARIO";
  if (n.includes("libro de familia")) return "LIBRO_FAMILIA";
  if (n.includes("titulo") || n.includes("estudios")) return "TITULO_ESTUDIOS";
  return "OTRO";
}

// Deduplicación de documentos requeridos: dos servicios pueden pedir el mismo documento
// con etiquetas distintas («Pasaporte» / «Pasaporte completo» → mismo tipo) — se queda la
// PRIMERA etiqueta (la del servicio principal). Los personalizados (OTRO) se deduplican
// por etiqueta normalizada: dos documentos custom distintos deben sobrevivir ambos.
export function dedupDocs(labels: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    const tipo = labelADocTipo(l);
    const clave = tipo === "OTRO" ? `otro:${l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}` : tipo;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(l);
  }
  return out;
}

// Documentos requeridos que aún faltan (no VALIDADO/PROCESANDO). Fuente única usada
// en /s/[token], el aviso de seguimiento, el detalle del gestor y el recordatorio.
export function docsFaltantes(
  requeridos: string[],
  subidos: { tipo?: string | null; etiqueta?: string | null; estado: string | null }[],
): string[] {
  // Por CASILLA (emparejarDocs), no por tipo: dos documentos pedidos a mano son los
  // dos OTRO y uno solo tapaba las dos casillas.
  const enCurso = subidos.filter((d) => d.estado === "VALIDADO" || d.estado === "PROCESANDO");
  return emparejarDocs(requeridos, enCurso)
    .map((d, i) => (d ? null : requeridos[i]))
    .filter((l): l is string => Boolean(l));
}

// DocumentoTipo → tipo_documento du schéma d'extraction (contrôle de cohérence).
export const DOC_A_TIPO_IA: Record<string, string> = {
  PASAPORTE: "pasaporte",
  TARJETA_RESIDENCIA_TIE: "tarjeta_residencia_tie",
  CERTIFICADO_NIE: "certificado_nie",
  EMPADRONAMIENTO: "empadronamiento",
  CONTRATO_TRABAJO: "contrato_trabajo",
  NOMINA: "nomina",
  ANTECEDENTES_PENALES: "antecedentes_penales",
  CERTIFICADO_BANCARIO: "certificado_bancario",
  LIBRO_FAMILIA: "libro_familia",
  TITULO_ESTUDIOS: "titulo_estudios",
};

// CLASIFICACIÓN AUTOMÁTICA (23/08, pedido de Matthias tras el email de Juan: «si me
// llega por email o en mano, no la subo a Aproba»): la IA ya detecta el tipo del
// documento — este resolutor lo convierte en (docTipo, label) para guardarlo en la
// casilla correcta sin que nadie elija nada en un desplegable.
// Prioridad del label: el literal REQUERIDO del servicio (respeta los nombres
// personalizados del gestor) > el label del catálogo > «Otro documento».
const TIPO_IA_A_DOC: Record<string, string> = Object.fromEntries(
  Object.entries(DOC_A_TIPO_IA).map(([doc, ia]) => [ia, doc]),
);

export function clasificarDeteccion(
  tipoDetectado: string,
  docsRequeridos: string[],
): { docTipo: string; label: string; requerido: boolean } {
  const docTipo = TIPO_IA_A_DOC[tipoDetectado] ?? "OTRO";
  const requerido = docsRequeridos.find((l) => labelADocTipo(l) === docTipo);
  return {
    docTipo,
    label: requerido ?? DOC_LABEL[docTipo] ?? "Otro documento",
    requerido: Boolean(requerido),
  };
}

export const FORM_LABEL: Record<string, string> = {
  EX15: "EX-15",
  EX17: "EX-17",
  EX18: "EX-18",
  EX19: "EX-19",
  TASA_790_012: "790-012",
};

// TipoTramite (enum DB) → clave du ServicioConfig (tarifas du workspace).
export const TIPO_A_SERVICIO: Record<string, string> = {
  ARRAIGO_SOCIAL: "arraigo_social",
  ARRAIGO_LABORAL: "arraigo_laboral",
  RENOVACION: "renovacion_tie",
  REAGRUPACION: "reagrupacion",
  NACIONALIDAD: "nacionalidad",
  RESIDENCIA_LARGA: "larga_duracion",
  NIE: "nie",
};

// Inverse : clave ServicioConfig → TipoTramite (quand le client choisit dans le portail).
export const SERVICIO_A_TIPO: Record<string, string> = Object.fromEntries(
  Object.entries(TIPO_A_SERVICIO).map(([tipo, clave]) => [clave, tipo]),
);

// ISO/timestamp → "dd/mm/aaaa" (format utilisé partout dans l'UI).
export function fmtFechaCorta(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Empareja las CASILLAS (labels, en su orden) con los documentos subidos. Un mismo
// documento no puede llenar dos casillas: se consume. Prioridad a la etiqueta exacta
// —imprescindible desde que el gestor pide documentos propios, que caen todos en el
// tipo técnico OTRO— y repli por tipo para las filas de antes de la etiqueta y para
// los sinónimos («Pasaporte» / «Pasaporte completo»).
export function emparejarDocs<T extends { tipo?: string | null; etiqueta?: string | null }>(
  labels: string[],
  docs: T[],
): (T | null)[] {
  const libres = [...docs];
  const sacar = (i: number) => (i >= 0 ? libres.splice(i, 1)[0] : null);
  const norm = (s: string) => s.trim().toLowerCase();
  return labels.map((label) => {
    const exacto = libres.findIndex((d) => d.etiqueta && norm(d.etiqueta) === norm(label));
    if (exacto >= 0) return sacar(exacto);
    const tipo = labelADocTipo(label);
    // Sin etiqueta propia: solo puede casar por tipo un documento que no lleve una
    // etiqueta DISTINTA (si la lleva, es de otra casilla y esperará a la suya).
    return sacar(libres.findIndex((d) => d.tipo === tipo && !d.etiqueta));
  });
}
