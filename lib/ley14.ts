// LEY 14/2013 — MOVILIDAD INTERNACIONAL (01/10/2026, Matthias: «parfaitement intégrée»).
//
// Un circuito aparte del régimen general: la autorización se pide a la Unidad de Grandes
// Empresas y Colectivos Estratégicos (UGE-CE) del Ministerio de Inclusión —no a la Oficina
// de Extranjería, ni por Mercurio—, con sus modelos MI (MI-T del titular, MI-F de cada
// familiar, MI-TIE de la tarjeta) y su tasa, la 790-038, cuyo impreso exige certificado o
// Cl@ve (Aproba no la genera: enlaza al Ministerio y la refactura como suplido).
//
// Módulo PURO (sin red ni base): lo comparten el catálogo, los formularios, Vigía, la ficha
// del expediente, el portal y las páginas públicas.

// Servicios del catálogo de este circuito. `movilidad_internacional` es el genérico de
// septiembre (despachos que ya lo activaron); los demás, uno por supuesto.
export const SERVICIOS_LEY14 = [
  "ley14_cualificado",
  "ley14_traslado",
  "ley14_teletrabajo",
  "ley14_emprendedor",
  "ley14_renovacion",
  "movilidad_internacional",
] as const;
export type ServicioLey14 = (typeof SERVICIOS_LEY14)[number];

// Claves antiguas o de importación que ya se trataban como Ley 14/2013.
const ALIAS = ["ley_14_2013", "nomada_digital", "teletrabajador"];
const CLAVES = new Set<string>([...SERVICIOS_LEY14, ...ALIAS]);

// Un servicio PROPIO del despacho (srv_…) se reconoce por su nombre, solo con reglas
// inequívocas: «Nómada digital», «Altamente cualificado», «Traslado intraempresarial»,
// «Ley 14/2013», «UGE»… Un «trabajador por cuenta ajena» NO es Ley 14/2013.
const NOMBRE_LEY14 = /ley ?14|\buge\b|movilidad internacional|altamente cualificad|\bpac\b|intraempresarial|nomada digital|teletrabajador internacional|teletrabajo internacional|visado de emprendedor|emprendedor.*(enisa|ley)|\benisa\b|golden visa|inversor/;
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function esLey14(clave?: string | null, label?: string | null): boolean {
  const k = String(clave ?? "").trim();
  if (CLAVES.has(k)) return true;
  if (k && !k.startsWith("srv_")) return false; // otra clave del catálogo: régimen general
  return NOMBRE_LEY14.test(sinAcentos(String(label ?? "")));
}

// Servicio del catálogo al que equivale (para modelos, validez y renovación). Un propio
// reconocido como Ley 14/2013 cae en el supuesto que su nombre dice, o en el genérico.
export function claveLey14(clave?: string | null, label?: string | null): ServicioLey14 | null {
  const k = String(clave ?? "").trim();
  if ((SERVICIOS_LEY14 as readonly string[]).includes(k)) return k as ServicioLey14;
  if (k === "nomada_digital" || k === "teletrabajador") return "ley14_teletrabajo";
  if (!esLey14(clave, label)) return null;
  const n = sinAcentos(String(label ?? ""));
  if (/renovacion|prorroga/.test(n)) return "ley14_renovacion";
  if (/nomada|teletrabaj/.test(n)) return "ley14_teletrabajo";
  if (/intraempresarial/.test(n)) return "ley14_traslado";
  if (/altamente cualificad|\bpac\b/.test(n)) return "ley14_cualificado";
  if (/emprendedor|enisa/.test(n)) return "ley14_emprendedor";
  return "movilidad_internacional";
}

// Modelos oficiales del circuito: titular, tarjeta y familiares.
export const FORMULARIOS_LEY14 = ["MI-T", "MI-TIE", "MI-F"];

// ── VIGÍA: validez (meses) de la autorización que resulta ────────────────────────────
// Ley 14/2013 (BOE consolidado; Criterio de gestión DGGM 2/2025 sobre duración):
//   · inicial: 3 años — PAC (art. 71.3; si el contrato es más corto, contrato + 3 meses),
//     traslado intraempresarial (art. 73: lo que dure el traslado, máx. 3 años),
//     emprendedor (art. 69), investigador (art. 72), teletrabajador (art. 74 quinquies);
//   · renovación: 2 años (art. 76.3); se pide en los 60 días previos y se admite hasta 90
//     días después de caducar. Los familiares siguen la del titular.
// La caducidad sembrada es ESTIMADA: el gestor la corrige con la fecha real de la TIE.
export const MESES_VALIDEZ_LEY14: Record<ServicioLey14, number> = {
  ley14_cualificado: 36,
  ley14_traslado: 36,
  ley14_teletrabajo: 36,
  ley14_emprendedor: 36,
  ley14_renovacion: 24,
  movilidad_internacional: 36,
};
export function mesesValidezLey14(clave?: string | null, label?: string | null): number | null {
  const c = claveLey14(clave, label);
  return c ? MESES_VALIDEZ_LEY14[c] : null;
}

// ── Dónde y cómo se presenta (Ministerio de Inclusión) ───────────────────────────────
// Sede del Ministerio de Inclusión (consultadas el 01/10/2026). La aplicación «iley11» sirve
// para todo el expediente: alta (y subsanaciones, aportaciones, recursos), consulta del
// estado y acuses, notificaciones por comparecencia y cambio de representante.
export const UGE = {
  nombre: "Unidad de Grandes Empresas y Colectivos Estratégicos (UGE-CE)",
  presentacion: "https://sede.inclusion.gob.es/w/presentacion-solicitudes-autorizacion-residencia",
  aplicacion: "https://expinterweb.inclusion.gob.es/iley11/inicio/showTramites.action?procedimientoSel=200&proc=1",
  tasa038: "https://sede.inclusion.gob.es/w/autorizaciones-de-trabajo-y-residencia-tasa-038",
  plazoResolucionDias: 20, // art. 76.1: silencio POSITIVO
  plazoSubsanacionDias: 10,
  plazoTieMeses: 1,         // la TIE se pide en la Policía en el mes siguiente a la concesión
};

// Tasa 790-012 de la TIE (Policía), epígrafes 4.2 (primera) y 4.3 (renovación).
export const TASA_TIE = { inicial: 16.08, renovacion: 19.3 };

// ── Tasa 790-038 (Ministerio de Inclusión) por supuesto ──────────────────────────────
// Importe oficial vigente (euros). Va como SUPLIDO del servicio (sin IVA) y la ficha lo
// recuerda junto al enlace del Ministerio: el impreso no se genera desde Aproba.
// Mismo importe para el titular y para cada familiar (epígrafe «Punto 7»): 73,26 € la
// inicial (FAQ oficial de la UGE-CE, 01/04/2026) y 78,67 € la renovada (impreso oficial).
const INICIAL = { concepto: "Tasa 790-038", importe: 73.26 };
export const TASA_038: Record<ServicioLey14, { concepto: string; importe: number }> = {
  ley14_cualificado: INICIAL,
  ley14_traslado: INICIAL,
  ley14_teletrabajo: INICIAL,
  ley14_emprendedor: INICIAL,
  ley14_renovacion: { concepto: "Tasa 790-038 (renovación)", importe: 78.67 },
  movilidad_internacional: INICIAL,
};
export function tasa038De(clave?: string | null, label?: string | null): { concepto: string; importe: number } | null {
  const c = claveLey14(clave, label);
  return c ? TASA_038[c] : null;
}
