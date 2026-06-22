import { BOARD_PHASES, ACCION_ESTADO, type ExpedienteEstado } from "@/lib/types";

// Helpers puros del pipeline de expedientes (sin datos nuevos). Una sola fuente para
// "¿en qué fase estoy?" y "¿qué toca hacer?", reutilizada por el tablero, el dashboard
// y el detalle del expediente — para que las tres vistas hablen el mismo idioma.

/** Índice de la fase (0..3) que contiene el estado, o -1 si no está en el board. */
export function phaseIndexOf(estado: ExpedienteEstado): number {
  return BOARD_PHASES.findIndex((p) => p.estados.includes(estado));
}

/** La fase del board que contiene el estado (o undefined). */
export function phaseOf(estado: ExpedienteEstado) {
  return BOARD_PHASES.find((p) => p.estados.includes(estado));
}

/** Acción siguiente del estado (label + flag espera). */
export function accionDe(estado: ExpedienteEstado) {
  return ACCION_ESTADO[estado];
}

/** true si la pelota está en el tejado del gestor (su turno), false si está esperando. */
export function esTuTurno(estado: ExpedienteEstado): boolean {
  return ACCION_ESTADO[estado]?.espera !== true;
}
