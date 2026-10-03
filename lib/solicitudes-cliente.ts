// TRÁMITES PEDIDOS POR EL CLIENTE desde su espacio (/c/[token]) — Jennifer, 03/10/2026:
// «quiero una alerta (campana + email) cuando un cliente crea un expediente desde su portal».
// El evento CREADO de ese expediente lleva esta marca y ningún usuario (lo hizo el cliente):
// la campana lo busca por ella. Reglas puras, compartidas por la ruta y la campana.
export const MARCA_SOLICITUD_CLIENTE = "Trámite solicitado por el cliente desde su espacio";

// La campana lo enseña hasta que alguien del despacho se lo asigna («Tramitado por»), se
// archiva, o pasan estos días (el email ya avisó el primer día).
export const DIAS_SOLICITUD = 7;

export const descripcionSolicitud = (etiquetas: string[]) => `🧑‍💻 ${MARCA_SOLICITUD_CLIENTE} (${etiquetas.join(" + ")})`;

// «🧑‍💻 Trámite solicitado… (Arraigo social + Reagrupación)» → «Arraigo social + Reagrupación».
export function serviciosDeDescripcion(descripcion: string): string {
  return /\(([^()]*)\)\s*$/.exec(descripcion)?.[1]?.trim() ?? "";
}
