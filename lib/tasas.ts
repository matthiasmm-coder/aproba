// Qué tasa acompaña a cada trámite. Antes la pantalla Formularios enseñaba las CINCO
// siempre; ahora sale la que toca y el gestor añade otra con el selector, igual que con
// los modelos EX (petición de Matthias, 18/09/2026).
//
// Reparto por organismo: 012 = Policía (tarjetas, NIE, certificados, regreso, UE/Brexit),
// 052 = Oficinas de Extranjería (autorizaciones de residencia), 062 = las mismas oficinas
// para las autorizaciones de TRABAJO, 026 = Justicia (nacionalidad), 006 = Justicia
// (certificado de antecedentes penales).
// La 790-038 de la Ley 14/2013 no está: su impreso exige certificado o Cl@ve en la sede
// del Ministerio, Aproba no la genera (ver lib/asistente.ts).

export const TASAS: { code: string; label: string }[] = [
  { code: "790-012", label: "Policía: TIE, NIE, certificados, regreso" },
  { code: "790-052", label: "Extranjería: autorizaciones de residencia" },
  { code: "790-062", label: "Extranjería: autorizaciones de trabajo" },
  { code: "790-026", label: "Justicia: nacionalidad" },
  { code: "790-006", label: "Justicia: antecedentes penales" },
];
export const ES_TASA = (code: string) => TASAS.some((t) => t.code === code);

// Por CLAVE de servicio del catálogo (tiene prioridad: es lo que el despacho vende).
const SERVICIO_TASAS: Record<string, string[]> = {
  nie: ["790-012"], renovacion_tie: ["790-012"], tie: ["790-012"],
  autorizacion_regreso: ["790-012"], regreso: ["790-012"],
  residencia_ue: ["790-012"], brexit: ["790-012"],
  arraigo_social: ["790-052"], arraigo_laboral: ["790-052"], arraigo_familiar: ["790-052"],
  reagrupacion: ["790-052"], larga_duracion: ["790-052"], modificacion: ["790-052"],
  nacionalidad: ["790-026"],
  // Residencia Y trabajo: la 052 la paga el trabajador, la 062 quien contrata.
  cuenta_ajena: ["790-052", "790-062"], cuenta_propia: ["790-052", "790-062"], temporada: ["790-052", "790-062"],
  // Ley 14/2013: su tasa es la 790-038, que no generamos → nada por defecto.
  movilidad_internacional: [], ley_14_2013: [], nomada_digital: [], teletrabajador: [],
};

// Repli por tipo de trámite (enum) cuando la clave del servicio no dice nada.
const TRAMITE_TASAS: Record<string, string[]> = {
  NIE: ["790-012"], TIE: ["790-012"], RENOVACION: ["790-012"],
  ARRAIGO_SOCIAL: ["790-052"], ARRAIGO_LABORAL: ["790-052"], ARRAIGO_FAMILIAR: ["790-052"],
  REAGRUPACION: ["790-052"], RESIDENCIA_LARGA: ["790-052"],
  NACIONALIDAD: ["790-026"],
};

// Tasas que salen SOLAS para este expediente. Sin correspondencia → ninguna: el gestor
// la añade con el selector. Enseñar las cinco «por si acaso» era justo el problema.
export function tasasDelTramite(tipoEnum?: string | null, claves?: (string | null | undefined)[] | null): string[] {
  const out: string[] = [];
  for (const c of claves ?? []) {
    if (!c) continue;
    for (const t of SERVICIO_TASAS[c] ?? []) if (!out.includes(t)) out.push(t);
  }
  if (out.length) return out;
  return [...(TRAMITE_TASAS[tipoEnum ?? ""] ?? [])];
}
