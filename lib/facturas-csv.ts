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

export function csvFacturasEmitidas(facturas: Factura[]): string {
  const filas = facturas.map((f) => {
    const imp = importesFactura(f);
    return [
      f.numero, f.fecha, f.cliente, nifDeDocumento(f.clienteDatos?.documento), f.concepto,
      num(imp.base), num(imp.iva), num(imp.suplidos), num(imp.total), num(imp.retencion), num(imp.aCobrar),
      FACTURA_ESTADO_META[f.estado]?.label ?? f.estado, f.origen === "AUTOMATICA" ? "Automática" : "Manual",
      f.emisorDatos?.nif ?? "",
    ];
  });
  return "﻿" + [CABECERA_CSV_EMITIDAS, ...filas].map((r) => r.map(esc).join(";")).join("\n");
}
