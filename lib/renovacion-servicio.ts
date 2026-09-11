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

// Mejor servicio ACTIVO para renovar `tipo`, con su grado de certeza:
//  · "seguro": correspondencia del catálogo por defecto (TIE → Renovación de TIE) → la
//    propuesta sale sola, sin diálogo.
//  · "probable": un servicio PROPIO del gestor cuyo nombre encaja (p. ej. «Renovación de
//    pasaporte») → se preselecciona, pero el gestor lo VALIDA antes de enviar.
//  · null: nada encaja → el gestor elige o crea el servicio en el diálogo.
export type Sugerencia = { id: string; certeza: "seguro" | "probable" } | null;
export function sugerirServicioRenovacion(tipo: string | null | undefined, catalogo: ServicioRenovable[]): Sugerencia {
  const t = String(tipo ?? "").toUpperCase();
  const activos = serviciosElegibles(catalogo);
  for (const id of CANDIDATOS_POR_TIPO[t] ?? []) if (activos.some((s) => s.id === id)) return { id, certeza: "seguro" };
  const re = PALABRAS_POR_TIPO[t];
  if (re) {
    const propio = activos.find((s) => s.id.startsWith("srv_") && re.test(s.label));
    if (propio) return { id: propio.id, certeza: "probable" };
  }
  return null;
}

// Nombre por defecto del servicio que el gestor puede CREAR desde el diálogo cuando el
// catálogo no tiene nada para este vencimiento (queda guardado para la próxima vez).
export const NOMBRE_SERVICIO_NUEVO: Record<string, string> = {
  TIE: "Renovación de TIE",
  RENOVACION: "Renovación de TIE",
  PASAPORTE: "Renovación de pasaporte",
  NIE: "Renovación del certificado de NIE",
};

// Nombre legible del tipo de vencimiento para el gestor (la lista lo enseña tal cual).
export const TIPO_VENCIMIENTO_LABEL: Record<string, string> = { TIE: "TIE", PASAPORTE: "Pasaporte", NIE: "NIE", RENOVACION: "Renovación" };

// ── Todo vencimiento se PROPONE como trámite (Matthias, 11/09/2026, 2.ª vuelta) ──
// Un pasaporte caducado también es un trámite que el despacho ofrece (renovación en el
// consulado): la única diferencia es que el servicio no está en el catálogo por defecto,
// así que el gestor lo valida —o lo crea— en el diálogo. «Pedir solo el documento nuevo»
// queda como camino SECUNDARIO en ese diálogo, para los tipos que el cliente puede
// renovar por su cuenta (pasaporte, certificado de NIE), nunca para el TIE.
const TIPOS_DOCUMENTO_PROPIO = new Set(["PASAPORTE", "NIE"]);
export const esDocumentoPropio = (tipo: string | null | undefined): boolean => TIPOS_DOCUMENTO_PROPIO.has(String(tipo ?? "").toUpperCase());

// Estados del vencimiento (texto en base, ver supabase/vigia-propuesta.sql).
export const ESTADOS_ABIERTOS = ["PENDIENTE", "AVISADO", "PROPUESTA", "TRAMITANDO", "RECHAZADA", "SOLICITADO"] as const;
// Con estos estados hay una renovación EN VUELO: no se vuelve a proponer ni se pisa la fecha.
export const ESTADOS_EN_VUELO = ["PROPUESTA", "TRAMITANDO"] as const;

// Importes que verá el cliente: honorarios CON IVA (misma cuenta que el portal /j: IVA
// sobre cada pago) + tasas/suplidos (sin IVA). «Precio a consultar» o 0 € → sin importes.
import { totalDe, r2 } from "@/lib/facturas";
export type ImportesCliente = { total: number | null; anticipo: number | null };
export function importesParaCliente(s: { precio?: number; anticipo: number; resto: number; precioOculto?: boolean; suplidos?: { importe: number }[] }): ImportesCliente {
  if (s.precioOculto) return { total: null, anticipo: null };
  const tasas = (s.suplidos ?? []).reduce((a, x) => a + (Number(x.importe) || 0), 0);
  const total = r2(totalDe(s.anticipo) + totalDe(s.resto) + tasas);
  if (total <= 0) return { total: null, anticipo: null };
  const anticipo = s.anticipo > 0 && s.resto > 0 ? r2(totalDe(s.anticipo) + tasas) : null;
  return { total, anticipo };
}
