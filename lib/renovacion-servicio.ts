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

// ── Dos naturalezas de vencimiento (Matthias, 11/09/2026) ─────────────────────
// SERVICIO: lo que caduca es una autorización que el despacho renueva como trámite
// (TIE). Se PROPONE al cliente (expediente + precio, sin factura hasta que acepte).
// DOCUMENTO: lo que caduca es un papel que el cliente renueva por su cuenta (pasaporte,
// certificado de NIE). No hay servicio ni expediente: se le PIDE el documento nuevo.
const TIPOS_SERVICIO = new Set(["TIE", "RENOVACION"]);
export const esVencimientoDeServicio = (tipo: string | null | undefined): boolean => TIPOS_SERVICIO.has(String(tipo ?? "").toUpperCase());

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
