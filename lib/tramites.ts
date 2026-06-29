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
  OTRO: "Otro documento",
};

// Libellé libre d'un document requis (config Ajustes) → enum DocumentoTipo.
export function labelADocTipo(label: string): string {
  const n = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

// Documentos requeridos que aún faltan (no VALIDADO/PROCESANDO). Fuente única usada
// en /s/[token], el aviso de seguimiento, el detalle del gestor y el recordatorio.
export function docsFaltantes(
  requeridos: string[],
  subidos: { tipo?: string | null; estado: string | null }[],
): string[] {
  const m = new Map(subidos.map((d) => [d.tipo ?? "", d.estado]));
  return requeridos.filter((label) => {
    const st = m.get(labelADocTipo(label));
    return st !== "VALIDADO" && st !== "PROCESANDO";
  });
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
