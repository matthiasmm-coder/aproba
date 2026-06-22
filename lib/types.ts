// Types du domaine pour l'app (mock). Miroir simplifié de prisma/schema.prisma —
// l'app tourne sans base de données : on branchera Prisma + Supabase plus tard.

export type ExpedienteEstado =
  | "BORRADOR"
  | "DOCS_PENDIENTES"
  | "DOCS_VALIDADOS"
  | "FORM_GENERADO"
  | "PRESENTADO"
  | "RESUELTO" // resolución favorable
  | "CITA_HUELLAS" // cita de huellas asignada (toma de huellas / TIE)
  | "FINALIZADO" // TIE entregado, trámite completado
  | "RECHAZADO"; // resolución desfavorable / denegado

export type DocumentoEstado = "PENDIENTE" | "PROCESANDO" | "VALIDADO" | "RECHAZADO";

export interface CampoExtraido {
  label: string;
  value: string;
}

export interface DocExtraction {
  tipoDetectado: string;
  confianzaGlobal: number; // 0-1
  legibilidad: "legible" | "parcial" | "ilegible";
  alertas: string[];
  campos: CampoExtraido[];
}

export interface Documento {
  id: string;
  tipoLabel: string;
  estado: DocumentoEstado;
  tieneArchivo?: boolean; // un fichier a été téléversé (téléchargeable par le gestor)
  nombreArchivo?: string;
  extraction?: DocExtraction;
}

export interface Formulario {
  id: string;
  tipo: string; // EX-15, EX-17, 790-012…
}

export interface Evento {
  fecha: string; // dd/mm
  titulo: string;
  autor?: string;
}

export interface Expediente {
  id: string;
  referencia: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  clienteNombre: string;
  clienteNacionalidad: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  clienteFicha?: import("@/lib/ficha").ClienteFicha;
  asignadoA: string;
  creado: string;
  fechaLimite?: string;
  documentos: Documento[];
  formularios: Formulario[];
  eventos: Evento[];
}

export const ESTADO_META: Record<
  ExpedienteEstado,
  { label: string; dot: string; pill: string }
> = {
  BORRADOR: { label: "Borrador", dot: "bg-slate-400", pill: "bg-slate-100 text-slate-600" },
  DOCS_PENDIENTES: { label: "Docs pendientes", dot: "bg-amber-500", pill: "bg-amber-100 text-amber-700" },
  DOCS_VALIDADOS: { label: "Docs validados", dot: "bg-aproba-500", pill: "bg-aproba-100 text-aproba-700" },
  FORM_GENERADO: { label: "Formularios listos", dot: "bg-blue-500", pill: "bg-blue-100 text-blue-700" },
  PRESENTADO: { label: "Presentado", dot: "bg-indigo-500", pill: "bg-indigo-100 text-indigo-700" },
  RESUELTO: { label: "Resolución favorable", dot: "bg-aproba-600", pill: "bg-aproba-100 text-aproba-700" },
  CITA_HUELLAS: { label: "Cita de huellas", dot: "bg-purple-500", pill: "bg-purple-100 text-purple-700" },
  FINALIZADO: { label: "Finalizado", dot: "bg-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
  RECHAZADO: { label: "Denegado", dot: "bg-red-500", pill: "bg-red-100 text-red-700" },
};

export const DOC_ESTADO_META: Record<
  DocumentoEstado,
  { label: string; pill: string }
> = {
  PENDIENTE: { label: "Pendiente", pill: "bg-slate-100 text-slate-500" },
  PROCESANDO: { label: "Procesando…", pill: "bg-amber-100 text-amber-700" },
  VALIDADO: { label: "Validado", pill: "bg-aproba-100 text-aproba-700" },
  RECHAZADO: { label: "Rechazado", pill: "bg-red-100 text-red-700" },
};

// Colonnes du board, dans l'ordre du workflow.
// BORRADOR = expediente créé, lien envoyé, le client n'a pas encore choisi son trámite.
// Colonnes du board, dans l'ordre du workflow (RECHAZADO = sortie, hors board actif →
// les dossiers denegados restent visibles dans la liste avec leur badge rouge).
export const BOARD_COLUMNS: ExpedienteEstado[] = [
  "BORRADOR",
  "DOCS_PENDIENTES",
  "DOCS_VALIDADOS",
  "FORM_GENERADO",
  "PRESENTADO",
  "RESUELTO",
  "CITA_HUELLAS",
  "FINALIZADO",
];

// Fases del board : agrupan los 8 estados en 4 etapas del pipeline para que el tablero
// quepa en pantalla y se lea como UN flujo (no 8 columnas sueltas). El estado fino sigue
// visible en cada tarjeta. RECHAZADO queda fuera (igual que en BOARD_COLUMNS).
export const BOARD_PHASES: { key: string; label: string; estados: ExpedienteEstado[] }[] = [
  { key: "recepcion",    label: "Recepción",    estados: ["BORRADOR", "DOCS_PENDIENTES"] },
  { key: "preparacion",  label: "Preparación",  estados: ["DOCS_VALIDADOS", "FORM_GENERADO"] },
  { key: "presentacion", label: "Presentación", estados: ["PRESENTADO", "RESUELTO"] },
  { key: "cierre",       label: "Cierre",       estados: ["CITA_HUELLAS", "FINALIZADO"] },
];

// Acción siguiente sugerida por estado (da el sentido de orquestación: la tarjeta dice
// qué toca hacer). `espera: true` = no depende del gestor (en gris), si no = su turno.
export const ACCION_ESTADO: Record<ExpedienteEstado, { label: string; espera?: boolean }> = {
  BORRADOR:        { label: "Enviar enlace al cliente" },
  DOCS_PENDIENTES: { label: "Esperando documentos", espera: true },
  DOCS_VALIDADOS:  { label: "Generar formularios" },
  FORM_GENERADO:   { label: "Presentar en Mercurio" },
  PRESENTADO:      { label: "Esperando resolución", espera: true },
  RESUELTO:        { label: "Agendar cita de huellas" },
  CITA_HUELLAS:    { label: "Recoger TIE y finalizar" },
  FINALIZADO:      { label: "Expediente cerrado", espera: true },
  RECHAZADO:       { label: "Expediente denegado", espera: true },
};
