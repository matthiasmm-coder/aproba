// HOJA DE ENCARGO y MANDATO: un interruptor para CADA uno (Matthias, 27/09/2026).
// Hasta entonces, «hojaEncargoActiva» encendía los dos a la vez. Ahora:
//   · hojaEncargoActiva → la hoja de encargo (y el presupuesto, que es la misma hoja).
//   · mandatoActivo     → el mandato de representación.
// Regla de compatibilidad: mandatoActivo null o ausente (antes de supabase/mandato-activo.sql,
// o una sede que nunca lo tocó) = SIGUE A LA HOJA, que es exactamente lo de antes.
//
// Módulo PURO (lo usan el servidor y los portales en el cliente).

export type EncargoActivo = { hoja: boolean; mandato: boolean };

export const ENCARGO_APAGADO: EncargoActivo = { hoja: false, mandato: false };

export function activoDeBloque(
  b: { hojaEncargoActiva?: boolean | null; mandatoActivo?: boolean | null } | null | undefined,
): EncargoActivo {
  const hoja = Boolean(b?.hojaEncargoActiva);
  return { hoja, mandato: typeof b?.mandatoActivo === "boolean" ? b.mandatoActivo : hoja };
}

export const algunoActivo = (a: EncargoActivo) => a.hoja || a.mandato;

// Las casillas de los documentos FIRMADOS que el cliente sube (mismas etiquetas en /j, /f, /s).
export const DOC_HOJA_FIRMADA = "Hoja de encargo firmada";
export const DOC_MANDATO_FIRMADO = "Mandato de representación firmado";
export const DOCS_FIRMA_TODOS = [DOC_HOJA_FIRMADA, DOC_MANDATO_FIRMADO];

export function docsFirma(a: EncargoActivo): string[] {
  return [...(a.hoja ? [DOC_HOJA_FIRMADA] : []), ...(a.mandato ? [DOC_MANDATO_FIRMADO] : [])];
}

// Cómo se nombra, en los emails, lo que el cliente tiene que firmar — con la concordancia
// del pronombre: fírmaLA (la hoja), fírmaLO (el mandato), fírmaLOS (los dos).
export type FirmaTexto = { que: string; queHtml: string; lo: "la" | "lo" | "los"; adjunto: string; enviado: string };
export function firmaTexto(a: EncargoActivo): FirmaTexto | null {
  if (a.hoja && a.mandato) return {
    que: "la hoja de encargo y el mandato de representación",
    queHtml: "la <strong>hoja de encargo</strong> y el <strong>mandato de representación</strong>",
    lo: "los", adjunto: "hoja de encargo y mandato adjuntos", enviado: "hoja de encargo y mandato enviados",
  };
  if (a.hoja) return { que: "la hoja de encargo", queHtml: "la <strong>hoja de encargo</strong>", lo: "la", adjunto: "hoja de encargo adjunta", enviado: "hoja de encargo enviada" };
  if (a.mandato) return { que: "el mandato de representación", queHtml: "el <strong>mandato de representación</strong>", lo: "lo", adjunto: "mandato adjunto", enviado: "mandato enviado" };
  return null;
}
