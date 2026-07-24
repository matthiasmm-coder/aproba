// Validez legal (meses) de la tarjeta que RESULTA de cada trámite de extranjería —
// tipificación española. Módulo PURO (sin server-only): lo comparten Vigía (servidor,
// al finalizar un expediente) y el motor de importación (que corre también en el cliente
// para la vista previa). De aquí sale la renovación que se "deduce del servicio y su fecha".
// v1 constante; v2: configurable por servicio. null = el trámite no produce tarjeta que caduque.
export const MESES_VALIDEZ: Record<string, number | null> = {
  ARRAIGO_SOCIAL: 12, // residencia inicial: 1 año
  ARRAIGO_LABORAL: 12,
  ARRAIGO_FAMILIAR: 12,
  TIE: 12, // primera TIE genérica
  REAGRUPACION: 12,
  RENOVACION: 48, // renovación estándar: 4 años
  RESIDENCIA_LARGA: 60, // larga duración: tarjeta cada 5 años
  NACIONALIDAD: null, // no caduca
  NIE: null, // el certificado NIE no se "renueva" como una TIE
  OTRO: null,
};

// Fecha ISO (AAAA-MM-DD) + N meses → ISO. "" si la entrada no es una fecha ISO válida.
// Usa UTC para no depender de la zona del runtime (mismo criterio que el resto de fechas).
export function sumarMeses(iso: string, meses: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return "";
  dt.setUTCMonth(dt.getUTCMonth() + meses); // el desbordamiento de día (29/02) rueda como en JS
  return dt.toISOString().slice(0, 10);
}

// Caducidad ESTIMADA de la tarjeta que resulta de `tipo`, realizado/resuelto en `fechaISO`.
// "" si el trámite no produce tarjeta que caduque (nacionalidad, NIE…) o la fecha es inválida.
export function caducidadEstimada(tipo: string, fechaISO: string): string {
  const meses = MESES_VALIDEZ[tipo];
  if (!meses) return "";
  return sumarMeses(fechaISO, meses);
}
