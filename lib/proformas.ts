// FACTURAS PROFORMA (pedido de Juan, 29/09/2026) — módulo PURO.
//
// Un documento con el importe exacto que el cliente va a pagar, ANTES de emitir la factura.
// No es una factura: serie propia (PRO-2026-0001), tabla propia ("Proforma",
// supabase/proformas.sql), fuera de la numeración de facturas, de las estadísticas, del CSV
// y de VERI*FACTU. Al cobrar se CONVIERTE en factura (lib/factura-manual.ts): número
// siguiente de la serie de facturas y fecha de ese día.

import type { ClienteDatosFactura, EmisorFijado, Factura, LineaFactura, Suplido } from "@/lib/facturas";
import type { CuerpoDocumento } from "@/lib/factura-manual";

export const PREFIJO_PROFORMA = "PRO";
export const DIAS_VALIDEZ_PROFORMA = 30;
// Lo que el documento dice de sí mismo (claves de t(): traducidas en lib/app-i18n.ts).
export const AVISO_PROFORMA = "Documento sin validez fiscal: no es una factura. La factura se emitirá al confirmarse el pago.";

export type ProformaEstado = "PENDIENTE" | "ENVIADA" | "CONVERTIDA" | "ANULADA";
export const PROFORMA_ESTADOS: readonly ProformaEstado[] = ["PENDIENTE", "ENVIADA", "CONVERTIDA", "ANULADA"];
export const PROFORMA_ESTADO_META: Record<ProformaEstado, { label: string; pill: string }> = {
  PENDIENTE: { label: "Pendiente de enviar", pill: "bg-amber-100 text-amber-800" },
  ENVIADA: { label: "Enviada", pill: "bg-sky-50 text-sky-700" },
  CONVERTIDA: { label: "Convertida en factura", pill: "bg-aproba-50 text-aproba-700" },
  ANULADA: { label: "Anulada", pill: "bg-slate-100 text-slate-500" },
};
// Se puede editar, enviar, convertir o anular mientras está viva.
export const proformaViva = (e: ProformaEstado) => e === "PENDIENTE" || e === "ENVIADA";
// Se borra solo si nunca salió del despacho: un número que el cliente ya vio no se reutiliza.
export const proformaBorrable = (e: ProformaEstado) => e === "PENDIENTE" || e === "ANULADA";

export type Proforma = {
  id: string; numero: string; estado: ProformaEstado;
  cliente: string; concepto: string; base: number; iva: number; total: number;
  lineas: LineaFactura[]; suplidos: Suplido[]; notas: string | null;
  clienteDatos: ClienteDatosFactura | null; clienteId: string | null; empresaId: string | null;
  retencionPct: number | null; retencion: number | null;
  emisorDatos: EmisorFijado | null; oficinaId: string | null; expedienteId: string | null;
  fecha: string;              // dd/mm/aaaa
  fechaIso: string | null;    // AAAA-MM-DD, para filtrar por periodo
  validaHasta: string | null; // dd/mm/aaaa
  facturaId: string | null; facturaNumero: string | null;
  enviadaAt: string | null; enviadaA: string | null; convertidaAt: string | null; createdAt: string;
};

export const COLS_PROFORMA = "id, numero, estado, clienteNombre, concepto, baseImponible, iva, total, lineas, suplidos, notas, clienteDatos, clienteId, empresaId, retencionPct, retencion, emisorDatos, oficinaId, expedienteId, fechaEmision, validaHasta, facturaId, enviadaAt, enviadaA, convertidaAt, createdAt, factura:Factura(numero)";

const fechaCorta = (iso: unknown): string => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
};
const numOr = (v: unknown, def: number | null): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? def : Number(v));

export function mapFilaProforma(r: Record<string, unknown>): Proforma {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const estado = (PROFORMA_ESTADOS as readonly string[]).includes(String(r.estado)) ? (r.estado as ProformaEstado) : "PENDIENTE";
  const fac = (Array.isArray(r.factura) ? r.factura[0] : r.factura) as { numero?: string | null } | null | undefined;
  const lineas = Array.isArray(r.lineas) ? (r.lineas as LineaFactura[]).map((l) => ({ concepto: String(l.concepto ?? ""), base: Number(l.base) || 0 })) : [];
  const suplidos = Array.isArray(r.suplidos) ? (r.suplidos as Suplido[]).map((x) => ({ concepto: String(x.concepto ?? ""), importe: Number(x.importe) || 0 })) : [];
  const emisor = (r.emisorDatos ?? null) as EmisorFijado | null;
  return {
    id: String(r.id), numero: String(r.numero ?? ""), estado,
    cliente: String(r.clienteNombre ?? ""), concepto: String(r.concepto ?? ""),
    base: numOr(r.baseImponible, 0) as number, iva: numOr(r.iva, 0) as number, total: numOr(r.total, 0) as number,
    lineas, suplidos, notas: s(r.notas),
    clienteDatos: (r.clienteDatos ?? null) as ClienteDatosFactura | null, clienteId: s(r.clienteId), empresaId: s(r.empresaId),
    retencionPct: numOr(r.retencionPct, null), retencion: numOr(r.retencion, null),
    emisorDatos: emisor?.nombre ? emisor : null, oficinaId: s(r.oficinaId), expedienteId: s(r.expedienteId),
    fecha: fechaCorta(r.fechaEmision), fechaIso: s(r.fechaEmision) ? new Date(String(r.fechaEmision)).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }) : null,
    validaHasta: fechaCorta(r.validaHasta) || null,
    facturaId: s(r.facturaId), facturaNumero: s(fac?.numero),
    enviadaAt: s(r.enviadaAt), enviadaA: s(r.enviadaA), convertidaAt: s(r.convertidaAt), createdAt: String(r.createdAt ?? ""),
  };
}

// Para pintarla con el MISMO documento que una factura (components/factura-documento.tsx y
// el PDF de lib/export-pdf.ts): «Vencimiento» pasa a ser «Válida hasta».
export function proformaComoFactura(p: Proforma): Factura {
  return {
    id: p.id, numero: p.numero, cliente: p.cliente, concepto: p.concepto, base: p.base, estado: "EMITIDA",
    fecha: p.fecha, vence: p.validaHasta ?? undefined,
    lineas: p.lineas.length ? p.lineas : undefined, suplidos: p.suplidos.length ? p.suplidos : undefined, notas: p.notas,
    clienteDatos: p.clienteDatos, iva: p.iva, total: p.total, retencionPct: p.retencionPct, retencion: p.retencion,
    emisorDatos: p.emisorDatos, oficinaId: p.oficinaId, expedienteId: p.expedienteId,
  };
}

// La factura que sale al convertirla: mismos importes, mismo receptor (el congelado en la
// proforma), misma oficina. El número lo pone la serie de facturas; las notas de la
// proforma («válida hasta…», instrucciones de pago) no pasan a la factura.
export function cuerpoFacturaDeProforma(p: Proforma): CuerpoDocumento {
  const avanzada = p.lineas.length > 0 || p.suplidos.length > 0;
  return {
    oficinaId: p.oficinaId, cliente: p.cliente, concepto: p.concepto,
    ...(avanzada
      ? { avanzada: true, lineas: p.lineas.length ? p.lineas : [{ concepto: p.concepto, base: p.base }], suplidos: p.suplidos, notas: null }
      : { baseImponible: p.base }),
    documento: p.clienteDatos?.documento ?? "", direccion: p.clienteDatos?.direccion ?? "",
    clienteId: p.clienteId, empresaId: p.clienteId ? null : p.empresaId,
    retencionPct: p.retencionPct,
  };
}
