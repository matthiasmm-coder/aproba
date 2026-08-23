// Types du domaine pour l'app (mock). Miroir simplifié de prisma/schema.prisma —
// l'app tourne sans base de données : on branchera Prisma + Supabase plus tard.

// ⚠️ CICLO DE VIDA — ver lib/progreso.ts. El modelo vivo son 5 estados
// (EN_PREPARACION, PRESENTADO, RESUELTO, RECHAZADO, FINALIZADO); los 4 antiguos de
// trabajo y CITA_HUELLAS siguen aquí porque las filas anteriores al remap todavía los
// llevan y el enum de Postgres no pierde valores. Todo lector normaliza con
// normalizarEstado(); nada nuevo debe ESCRIBIRSE con un valor legado.
export type ExpedienteEstado =
  | "EN_PREPARACION"
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
  tipo?: string; // clave técnica del tipo de documento (para casar con los requeridos)
  etiqueta?: string | null; // casilla EXACTA a la que pertenece (documentos propios)
  clienteId?: string | null; // familiar: miembro al que pertenece (null = del expediente)
  tipoLabel: string;
  estado: DocumentoEstado;
  tieneArchivo?: boolean; // un fichier a été téléversé (téléchargeable par le gestor)
  nombreArchivo?: string;
  extraction?: DocExtraction;
}

export interface Formulario {
  code: string; // EX-15, EX-17… (código de descarga del PDF oficial)
  tipo: string; // etiqueta humana (FORM_LABEL)
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
  clienteId?: string | null;
  clienteNacionalidad: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  clienteFicha?: import("@/lib/ficha").ClienteFicha;
  asignadoA: string;
  asignadoAId?: string | null; // id brut: le sélecteur d'affectation a besoin de l'id, pas du nom
  creado: string;
  presentadoEl?: string; // dd/mm/aaaa — cuándo se depositó en la Administración
  fechaLimite?: string;
  documentos: Documento[];
  formularios: Formulario[];
  eventos: Evento[];
}

// ESTADO_META (los 9 estados viejos) VIVIÓ AQUÍ hasta el 22/08/2026; su sucesora
// ESTADO5_META se retiró el mismo día al desaparecer las píldoras de estado de todas
// las pantallas (lib/progreso.ts cuenta la historia). Cualquier lectura de estado pasa
// por normalizarEstado(), nunca por el valor bruto de la base.
// ⚠️ FACTURA_ESTADO_META y DOC_ESTADO_META son OTRAS máquinas de estados: no se tocan.

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
  "EN_PREPARACION",
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
// Nombres de las 4 fases (renombrados el 22/08/2026 a petición de Matthias).
// ⚠️ LAS CLAVES NO CAMBIAN — son las que usa lib/progreso.ts (faseDe) y las que ya
// están escritas en el código y en los tests. Por eso hay un DESFASE deliberado entre
// clave y etiqueta: la clave "recepcion" se llama ahora «Preparación», y la clave
// "preparacion" se llama «Listo para presentar». Al tocar esto, mirar la etiqueta,
// nunca deducir del nombre de la clave.
export const BOARD_PHASES: { key: string; label: string; estados: ExpedienteEstado[] }[] = [
  { key: "recepcion",    label: "Preparación",          estados: ["EN_PREPARACION", "BORRADOR", "DOCS_PENDIENTES"] },
  { key: "preparacion",  label: "Listo para presentar", estados: ["DOCS_VALIDADOS", "FORM_GENERADO"] },
  { key: "presentacion", label: "Presentado",           estados: ["PRESENTADO"] },
  { key: "cierre",       label: "Resultado",            estados: ["RESUELTO", "RECHAZADO", "CITA_HUELLAS", "FINALIZADO"] },
];

// Acción siguiente sugerida por estado (da el sentido de orquestación: la tarjeta dice
// qué toca hacer). `espera: true` = no depende del gestor (en gris), si no = su turno.
export const ACCION_ESTADO: Record<ExpedienteEstado, { label: string; espera?: boolean }> = {
  EN_PREPARACION:  { label: "En preparación" },
  BORRADOR:        { label: "Enviar enlace al cliente" },
  DOCS_PENDIENTES: { label: "Generar formularios" }, // repli alineado: preparar nunca espera
  DOCS_VALIDADOS:  { label: "Generar formularios" },
  FORM_GENERADO:   { label: "Presentar en Mercurio" },
  PRESENTADO:      { label: "Esperando resolución", espera: true },
  RESUELTO:        { label: "Agendar cita" },
  CITA_HUELLAS:    { label: "Finalizar" },
  FINALIZADO:      { label: "Expediente cerrado", espera: true },
  RECHAZADO:       { label: "Expediente denegado", espera: true },
};
