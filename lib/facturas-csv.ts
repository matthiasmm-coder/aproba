import { FACTURA_ESTADO_META, importesFactura, nifDeDocumento, type Factura } from "@/lib/facturas";

// CSV de las facturas EMITIDAS (botón «CSV» de Facturas). Lo pide quien lleva la
// contabilidad: por eso lleva el NIF/CIF del cliente (el impreso en la factura, como el
// CSV de recibidas lleva el del proveedor — pedido de Luis, 23/09/2026) y los suplidos en
// su columna, para que Base + IVA + Suplidos = Total en cada fila.
// Formato de Excel en España: «;» como separador, coma decimal y BOM UTF-8.
// Retención de IRPF (28/09/2026): «Total» sigue siendo el de la factura; «Total a cobrar» es
// lo que paga el cliente. «NIF emisor»: con varias sedes o profesionales que facturan con su
// propio NIF (Asenjo), el contable separa las facturas de cada uno.

export const CABECERA_CSV_EMITIDAS = ["Número", "Fecha", "Cliente", "NIF/CIF", "Concepto", "Base", "IVA", "Suplidos", "Total", "Retención", "Total a cobrar", "Estado", "Origen", "NIF emisor"];

const num = (n: number) => n.toFixed(2).replace(".", ",");
const esc = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Lo facturado ANTES de Aproba (migración) en el mismo periodo, detrás de las de Aproba y
// con «Origen: Anterior a Aproba» (pedido de Luis, 29/09/2026: su 2026 entero es migrado).
// Sin desglose importado, Base e IVA quedan vacíos (no se inventan); sin retención conocida.
export type FacturaAnteriorCsv = {
  ref?: string | null; fecha: string; cliente: string; nif: string | null; concepto?: string | null;
  base: number | null; iva: number | null; total: number; cobro: "COBRADA" | "PENDIENTE" | null;
};
const fechaEs = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

export function csvFacturasEmitidas(facturas: Factura[], anteriores: FacturaAnteriorCsv[] = []): string {
  const previas = anteriores.map((a) => [
    a.ref ?? "", fechaEs(a.fecha), a.cliente, a.nif ?? "", a.concepto ?? "",
    a.base == null ? "" : num(a.base), a.base == null ? "" : num(a.iva ?? 0), "", num(a.total), "", num(a.total),
    a.cobro === "COBRADA" ? "Cobrada" : a.cobro === "PENDIENTE" ? "Pendiente" : "", "Anterior a Aproba", "",
  ]);
  const filas = facturas.map((f) => {
    const imp = importesFactura(f);
    return [
      f.numero, f.fecha, f.cliente, nifDeDocumento(f.clienteDatos?.documento), f.concepto,
      num(imp.base), num(imp.iva), num(imp.suplidos), num(imp.total), num(imp.retencion), num(imp.aCobrar),
      FACTURA_ESTADO_META[f.estado]?.label ?? f.estado, f.origen === "AUTOMATICA" ? "Automática" : "Manual",
      f.emisorDatos?.nif ?? "",
    ];
  });
  return "﻿" + [CABECERA_CSV_EMITIDAS, ...filas, ...previas].map((r) => r.map(esc).join(";")).join("\n");
}
