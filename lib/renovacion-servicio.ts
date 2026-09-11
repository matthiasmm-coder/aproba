// VIGÍA — qué SERVICIO del catálogo corresponde a la renovación de un vencimiento.
//
// Módulo PURO (sin server-only): lo comparten la ruta /api/vencimientos/[id]/renovar
// (que se niega a crear una renovación sin servicio) y el diálogo del gestor (que
// preselecciona la sugerencia). Antes la ruta clavaba «renovacion_tie» para TODO
// vencimiento —un pasaporte caducado creaba una «Renovación de TIE»— y, si ese
// servicio estaba desactivado, el expediente nacía sin servicio: el cliente recibía
// un aviso de renovación sin saber de qué trámite ni a qué precio (Matthias, 11/09/2026).

export type ServicioRenovable = { id: string; label: string; active: boolean };

// Candidatos del catálogo por defecto, por orden de preferencia.
export const CANDIDATOS_POR_TIPO: Record<string, string[]> = {
  TIE: ["renovacion_tie", "larga_duracion"],
  RENOVACION: ["renovacion_tie"],
  NIE: ["nie"],
  PASAPORTE: [], // ningún despacho renueva pasaportes por defecto: solo un servicio propio
};

// Servicios PROPIOS del gestor (srv_…) reconocibles por su nombre.
const PALABRAS_POR_TIPO: Record<string, RegExp> = {
  TIE: /renov|tie\b|tarjeta/i,
  RENOVACION: /renov/i,
  NIE: /\bnie\b/i,
  PASAPORTE: /pasaporte|passport/i,
};

export const serviciosElegibles = <S extends ServicioRenovable>(catalogo: S[]): S[] => catalogo.filter((s) => s.active);

// Mejor servicio ACTIVO para renovar `tipo`, o null si el catálogo no tiene ninguno
// que encaje — en ese caso el gestor debe elegir a mano, nunca se adivina.
export function sugerirServicioRenovacion(tipo: string | null | undefined, catalogo: ServicioRenovable[]): string | null {
  const t = String(tipo ?? "").toUpperCase();
  const activos = serviciosElegibles(catalogo);
  for (const id of CANDIDATOS_POR_TIPO[t] ?? []) if (activos.some((s) => s.id === id)) return id;
  const re = PALABRAS_POR_TIPO[t];
  if (re) {
    const propio = activos.find((s) => s.id.startsWith("srv_") && re.test(s.label));
    if (propio) return propio.id;
  }
  return null;
}

// Nombre legible del tipo de vencimiento para el gestor (la lista lo enseña tal cual).
export const TIPO_VENCIMIENTO_LABEL: Record<string, string> = { TIE: "TIE", PASAPORTE: "Pasaporte", NIE: "NIE", RENOVACION: "Renovación" };
