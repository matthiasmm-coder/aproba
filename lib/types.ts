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
// visible en cada tarjeta.
// FLUJO v4 (03/09/2026, Matthias): el ciclo del despacho termina en la ENTREGA. Dos
// columnas de TRABAJO — «Preparación» (datos, documentos, formularios, citas y cobro, en
// el orden en que lleguen) y «Preparado» (dossier listo: formularios/tasa generados o
// marcado a mano) — y un solo gesto de cierre, «Facturar y archivar», que registra la
// salida (Expediente.salida). La respuesta de la Administración ya no es una columna.
// Las 4 fases anteriores (recepcion/preparacion/presentacion/cierre) desaparecen; los
// `estados` son solo el repli de filas sin progreso calculado.
export const BOARD_PHASES: { key: string; label: string; estados: ExpedienteEstado[] }[] = [
  { key: "preparacion", label: "Preparación", estados: ["EN_PREPARACION", "BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS"] },
  { key: "preparado",   label: "Preparado",   estados: ["FORM_GENERADO", "PRESENTADO", "CITA_HUELLAS", "RESUELTO", "RECHAZADO", "FINALIZADO"] },
];

// Salida del expediente al cerrarlo (Expediente.salida, migración supabase/flujo-v4.sql).
export type Salida = "en_tramite" | "concedido" | "denegado" | "desistido";
export const SALIDAS: { key: Salida; label: string; ayuda: string }[] = [
  { key: "en_tramite", label: "En trámite", ayuda: "Presentado ante la Administración, o entregado al cliente para que lo presente. Pendiente de resolución." },
  { key: "concedido", label: "Concedido", ayuda: "Resolución favorable recibida. Vigía toma la fecha de caducidad de aquí." },
  { key: "denegado", label: "Denegado", ayuda: "Resolución desfavorable o inadmisión. Cabe recurso o nueva solicitud." },
  { key: "desistido", label: "Desistido", ayuda: "Cerrado sin presentar: el cliente no siguió, sin documentación o sin pago." },
];
export const etiquetaSalida = (k: string | null | undefined): string | null => SALIDAS.find((s) => s.key === k)?.label ?? null;
// Archivados de antes de la migración (sin salida): la categoría se deduce del estado.
export function salidaDeEstado(estado: string): Salida | null {
  if (estado === "RESUELTO" || estado === "FINALIZADO") return "concedido";
  if (estado === "RECHAZADO") return "denegado";
  if (estado === "PRESENTADO" || estado === "CITA_HUELLAS") return "en_tramite";
  return null;
}

// Acción siguiente sugerida por estado (da el sentido de orquestación: la tarjeta dice
// qué toca hacer). `espera: true` = no depende del gestor (en gris), si no = su turno.
export const ACCION_ESTADO: Record<ExpedienteEstado, { label: string; espera?: boolean }> = {
  EN_PREPARACION:  { label: "En preparación" },
  BORRADOR:        { label: "Enviar enlace al cliente" },
  DOCS_PENDIENTES: { label: "Generar formularios" }, // repli alineado: preparar nunca espera
  DOCS_VALIDADOS:  { label: "Generar formularios" },
  FORM_GENERADO:   { label: "Facturar y archivar" },
  PRESENTADO:      { label: "Facturar y archivar" },
  RESUELTO:        { label: "Facturar y archivar" },
  CITA_HUELLAS:    { label: "Facturar y archivar" },
  FINALIZADO:      { label: "Expediente cerrado", espera: true },
  RECHAZADO:       { label: "Expediente denegado", espera: true },
};
