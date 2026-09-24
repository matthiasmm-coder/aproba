// ESTADO EN EXTRANJERÍA (Matthias, 24/09/2026): una sola lectura de «qué dice la
// Administración» para la ficha (sección unificada) y la fila de la lista. Puro.
//
// Prioridad: la resolución manda (concedido / denegado); si no la hay, un requerimiento
// PENDIENTE (el plazo corre); si no, lo que el gestor anotó en su última consulta
// («en trámite» + fecha); si no, nada registrado.

export const ESTADOS_EXTRANJERIA = ["EN_TRAMITE"] as const;
export type EstadoExtranjeria = (typeof ESTADOS_EXTRANJERIA)[number];
export const esEstadoExtranjeria = (v: unknown): v is EstadoExtranjeria =>
  typeof v === "string" && (ESTADOS_EXTRANJERIA as readonly string[]).includes(v);

export type SituacionExtranjeria =
  | { tipo: "resuelta"; salida: "concedido" | "denegado" }
  | { tipo: "requerimiento"; fechaLimite: string } // ISO del plazo más cercano
  | { tipo: "en_tramite"; consultadoEl: string }   // ISO de la última consulta
  | { tipo: "sin_respuesta" };

export function situacionExtranjeria(i: {
  resuelta: "concedido" | "denegado" | null;
  requerimientos: { estado: string; fechaLimite: string }[];
  estado: string | null;
  estadoAt: string | null;
}): SituacionExtranjeria {
  if (i.resuelta) return { tipo: "resuelta", salida: i.resuelta };
  const pendientes = i.requerimientos.filter((r) => r.estado === "PENDIENTE" && r.fechaLimite).map((r) => r.fechaLimite).sort();
  if (pendientes.length) return { tipo: "requerimiento", fechaLimite: pendientes[0] };
  if (i.estado === "EN_TRAMITE" && i.estadoAt) return { tipo: "en_tramite", consultadoEl: i.estadoAt };
  return { tipo: "sin_respuesta" };
}
