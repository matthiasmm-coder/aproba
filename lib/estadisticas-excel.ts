import "server-only";
import * as XLSX from "xlsx";
import {
  MESES_CORTOS_ES, calcularEstadisticas, enPeriodo, nombrePeriodo,
  type Estadisticas, type MovEmitida, type MovRecibida,
} from "@/lib/estadisticas-facturacion";

// DATOS DE LAS ESTADÍSTICAS en Excel (Facturas › Estadísticas › «Excel»): lo mismo que el
// informe, en números de verdad (no texto) para quien lleve la contabilidad, más el
// detalle factura a factura del periodo y los rankings completos (no solo el top).

const EUR = '#,##0.00 "€"';
const PCT = "0.0%";
const FECHA = "dd/mm/yyyy";

type Celda = string | number | Date | null;

function hoja(filas: Celda[][], anchos: number[], formatos: Record<number, string> = {}, desdeFila = 1): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(filas, { cellDates: true });
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  // Formato por columna (a partir de la fila de datos): importes en €, fechas, %.
  for (let r = desdeFila; r < filas.length; r++) {
    for (const [col, z] of Object.entries(formatos)) {
      const ref = XLSX.utils.encode_cell({ r, c: Number(col) });
      const cell = ws[ref];
      if (cell && (cell.t === "n" || cell.t === "d")) cell.z = z;
    }
  }
  return ws;
}

const fechaCelda = (iso: string): Date => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function estadisticasToXlsx(
  est: Estadisticas,
  mov: { emitidas: MovEmitida[]; recibidas: MovRecibida[] },
  despacho: { nombre: string; nif: string | null; sede?: string | null },
): Uint8Array {
  const r = est.resumen;
  const wb = XLSX.utils.book_new();
  const hoy = new Date();

  // 1. Resumen
  const resumen: Celda[][] = [
    ["Informe de facturación", null],
    [despacho.nombre + (despacho.nif ? ` · ${despacho.nif}` : ""), null],
    [nombrePeriodo(est.periodo) + (despacho.sede ? ` · Sede: ${despacho.sede}` : ""), null],
    [`Generado el ${hoy.toLocaleDateString("es-ES")}`, null],
    [null, null],
    ["Concepto", "Importe"],
    ["Ingresos (sin IVA)", r.ingresos.base],
    ["IVA repercutido", r.ingresos.iva],
    ["Facturado con IVA (incl. suplidos)", r.ingresos.total],
    ["Facturas emitidas", r.ingresos.n],
    ["Cobrado", r.ingresos.cobrado],
    ["Pendiente de cobro", r.ingresos.pendiente],
    ["Gastos (sin IVA)", r.gastos.base],
    ["IVA soportado", r.gastos.iva],
    ["Retenciones practicadas", r.gastos.retenciones],
    ["Total a pagar a proveedores", r.gastos.total],
    ["Facturas recibidas", r.gastos.n],
    ["Pagado", r.gastos.pagado],
    ["Pendiente de pago", r.gastos.pendiente],
    ["Resultado (ingresos - gastos)", r.resultado],
    ["Margen", r.margen],
    ["IVA estimado (+ a ingresar / - a compensar)", r.ivaNeto],
    [null, null],
    ["El IVA y las retenciones son una estimación hecha con las facturas registradas en Aproba: no sustituyen a los modelos 303, 111 o 115.", null],
  ];
  if (r.ingresos.sinDesglose) resumen.push([`${r.ingresos.sinDesglose} facturas importadas sin desglose de IVA: cuentan en lo facturado con IVA (${r.ingresos.sinDesgloseTotal.toFixed(2)} €), no en los ingresos ni en el IVA.`, null]);
  const wsR = hoja(resumen, [58, 16], { 1: EUR }, 6);
  for (const fila of [9, 16]) { const cell = wsR[XLSX.utils.encode_cell({ r: fila, c: 1 })]; if (cell) cell.z = "0"; } // recuentos
  const margen = wsR[XLSX.utils.encode_cell({ r: 20, c: 1 })]; if (margen) margen.z = PCT;
  XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

  // 2. Trimestres
  const cabT = ["Trimestre", "Ingresos (sin IVA)", "IVA repercutido", "Gastos (sin IVA)", "IVA soportado", "Retenciones", "IVA estimado", "Resultado", "Facturado con IVA", "Cobrado", "Pendiente de cobro"];
  const filasT: Celda[][] = [cabT, ...est.trimestres.map((q) => [`T${q.trimestre} ${est.periodo.anio}`, q.ingresos.base, q.ingresos.iva, q.gastos.base, q.gastos.iva, q.gastos.retenciones, q.ivaNeto, q.resultado, q.ingresos.total, q.ingresos.cobrado, q.ingresos.pendiente])];
  const sum = (k: number) => Math.round(filasT.slice(1).reduce((s, f) => s + Number(f[k] ?? 0), 0) * 100) / 100;
  filasT.push([`Total ${est.periodo.anio}`, ...cabT.slice(1).map((_, i) => sum(i + 1))]);
  XLSX.utils.book_append_sheet(wb, hoja(filasT, [16, 16, 15, 16, 15, 13, 14, 14, 17, 14, 17], Object.fromEntries(cabT.slice(1).map((_, i) => [i + 1, EUR]))), "Trimestres");

  // 3. Meses
  const cabM = ["Mes", "Ingresos (sin IVA)", "Gastos (sin IVA)", "Resultado", "IVA repercutido", "IVA soportado", "Importadas sin desglose (IVA incl.)", "Facturas emitidas", "Facturas recibidas"];
  const filasM: Celda[][] = [cabM, ...est.meses.map((m) => [`${MESES_CORTOS_ES[m.mes - 1]} ${est.periodo.anio}`, m.ingresos, m.gastos, m.resultado, m.ivaRepercutido, m.ivaSoportado, m.ingresosSinDesglose, m.nEmitidas, m.nRecibidas])];
  XLSX.utils.book_append_sheet(wb, hoja(filasM, [12, 16, 16, 14, 15, 14, 22, 12, 12], { 1: EUR, 2: EUR, 3: EUR, 4: EUR, 5: EUR, 6: EUR }), "Meses");

  // 4-5. Rankings COMPLETOS del periodo (el informe solo enseña el top).
  const completo = calcularEstadisticas(mov.emitidas, mov.recibidas, est.periodo, { top: 100000 });
  XLSX.utils.book_append_sheet(wb, hoja(
    [["Cliente", "Facturas", "Base (sin IVA)", "Facturado con IVA", "Cuota"], ...completo.topClientes.map((c) => [c.nombre, c.n, c.base, c.total, c.cuota])],
    [44, 10, 16, 18, 9], { 2: EUR, 3: EUR, 4: PCT },
  ), "Clientes");
  XLSX.utils.book_append_sheet(wb, hoja(
    [["Proveedor", "Facturas", "Base (sin IVA)", "Total a pagar", "Cuota"], ...completo.topProveedores.map((c) => [c.nombre, c.n, c.base, c.total, c.cuota])],
    [44, 10, 16, 16, 9], { 2: EUR, 3: EUR, 4: PCT },
  ), "Proveedores");

  // 6-7. Detalle del periodo, factura a factura.
  const em = mov.emitidas.filter((m) => enPeriodo(m.fecha, est.periodo)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  XLSX.utils.book_append_sheet(wb, hoja(
    [["Fecha", "Nº factura", "Cliente", "Concepto", "Base (sin IVA)", "IVA", "Total", "Cobrado", "Pendiente", "Origen"],
      ...em.map((m) => [fechaCelda(m.fecha), m.ref ?? "", m.cliente, m.concepto ?? "", m.base, m.iva, m.total, m.cobrado, m.cobrado == null ? null : Math.round((m.total - m.cobrado) * 100) / 100, m.fuente === "APROBA" ? "Aproba" : "Anterior a Aproba"])],
    [11, 16, 34, 40, 14, 11, 12, 12, 12, 17], { 0: FECHA, 4: EUR, 5: EUR, 6: EUR, 7: EUR, 8: EUR },
  ), "Emitidas");
  const re = mov.recibidas.filter((m) => enPeriodo(m.fecha, est.periodo)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  XLSX.utils.book_append_sheet(wb, hoja(
    [["Fecha", "Nº factura", "Proveedor", "Concepto", "Base (sin IVA)", "IVA", "Retención", "Total a pagar", "Estado"],
      ...re.map((m) => [fechaCelda(m.fecha), m.ref ?? "", m.proveedor, m.concepto ?? "", m.base, m.iva, m.retencion, m.total, m.pagada ? "Pagada" : "Pendiente"])],
    [11, 16, 34, 40, 14, 11, 11, 13, 11], { 0: FECHA, 4: EUR, 5: EUR, 6: EUR, 7: EUR },
  ), "Recibidas");

  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
