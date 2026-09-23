import { describe, it, expect } from "vitest";
import { normalizarFacturaLeida, normalizarCamposEditados, agruparPorMes, csvFacturasRecibidas, filtrarPeriodo, totalesDe, nombreEnZip, motivoNoPagable, camposParaDb, type FacturaRecibida } from "./facturas-recibidas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fila = (p: Partial<FacturaRecibida>): FacturaRecibida => ({
  id: "f1", proveedorNombre: "Papelería Vallès", proveedorNif: "B12345678", proveedorIban: "ES3700490001502310107890", numero: "A-1", fecha: "2026-09-10", retencion: null, tipoRetencion: null, baseImponible: 100, tipoIva: 21, cuotaIva: 21, total: 121,
  concepto: "Material", notas: "", expedienteId: null, oficinaId: null, archivoNombre: "f.pdf", archivoMime: "application/pdf", archivoSize: 10, origen: "MANUAL", estado: "PENDIENTE", fechaPago: "", ordenPago: "", revisar: false, confianza: 0.9, createdAt: "2026-09-10T10:00:00Z", ...p,
});

describe("facturas recibidas · lectura", () => {
  it("normaliza importes en formato español y completa base + IVA = total", () => {
    const r = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: " Vodafone España S.A.U. ", proveedor_nif: "a-80 907 397", numero: "VF-22", fecha: "12/09/2026", base_imponible: "1.000,00", tipo_iva: 21, confianza: 0.92 });
    expect(r.esFactura).toBe(true);
    expect(r.campos.proveedorNif).toBe("A80907397");
    expect(r.campos.fecha).toBe("2026-09-12");
    expect(r.campos.cuotaIva).toBe(210);
    expect(r.campos.total).toBe(1210);
    expect(r.revisar).toBe(false);
  });
  it("deduce la base desde el total y el tipo, y el tipo desde base y cuota", () => {
    const a = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", total: 121, tipo_iva: 21, confianza: 0.9 });
    expect(a.campos.baseImponible).toBe(100); expect(a.campos.cuotaIva).toBe(21);
    const b = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", base_imponible: 200, cuota_iva: 20, total: 220, confianza: 0.9 });
    expect(b.campos.tipoIva).toBe(10);
  });
  it("marca «revisar» cuando falta el total, la fecha o el proveedor, o si no es factura", () => {
    expect(normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", confianza: 0.9 }).revisar).toBe(true);
    const no = normalizarFacturaLeida({ es_factura: false, confianza: 0.95 });
    expect(no.esFactura).toBe(false); expect(no.revisar).toBe(true); expect(no.avisos[0]).toBe("No parece una factura");
    expect(normalizarFacturaLeida(null).esFactura).toBe(false);
  });
  it("avisa si los importes no cuadran y si la moneda no es euro", () => {
    const r = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", base_imponible: 100, cuota_iva: 21, total: 150, moneda: "USD", confianza: 0.9 });
    expect(r.avisos.some((a) => a.includes("no cuadran"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("USD"))).toBe(true);
    expect(r.revisar).toBe(true);
  });
  it("los campos editados a mano se normalizan igual (fecha, importes, NIF) y vacío = null", () => {
    const c = normalizarCamposEditados({ fecha: "1/2/2026", baseImponible: "50,5", total: "", proveedorNif: " b 12 ", expedienteId: "  " });
    expect(c.fecha).toBe("2026-02-01"); expect(c.baseImponible).toBe(50.5); expect(c.total).toBeNull(); expect(c.proveedorNif).toBe("B12"); expect(c.expedienteId).toBeNull();
  });
});

describe("facturas recibidas · listado y export", () => {
  const items = [
    fila({ id: "a", fecha: "2026-09-10", total: 121, baseImponible: 100, cuotaIva: 21 }),
    fila({ id: "b", fecha: "2026-08-02", total: 60.5, baseImponible: 50, cuotaIva: 10.5, proveedorNombre: "Alquiler, S.L." }),
    fila({ id: "c", fecha: "", total: null, baseImponible: null, cuotaIva: null, revisar: true, createdAt: "2026-09-16T08:00:00Z" }),
    fila({ id: "d", fecha: "2026-09-01", total: 10, baseImponible: 10, cuotaIva: 0, tipoIva: 0 }),
  ];
  it("agrupa por mes del más reciente al más antiguo, con «Sin fecha» primero", () => {
    const g = agruparPorMes(items);
    expect(g.map((x) => x.clave)).toEqual(["sin-fecha", "2026-09", "2026-08"]);
    expect(g[1].items.map((x) => x.id)).toEqual(["a", "d"]);
    expect(g[1].total).toBe(131); expect(g[1].base).toBe(110); expect(g[1].iva).toBe(21);
    expect(g[1].etiqueta).toBe("septiembre 2026");
  });
  it("el periodo filtra por fecha de factura y conserva las sin fecha", () => {
    expect(filtrarPeriodo(items, "2026-09-01", "2026-09-30").map((x) => x.id).sort()).toEqual(["a", "c", "d"]);
    expect(totalesDe(filtrarPeriodo(items, "2026-08-01", "2026-08-31"))).toEqual({ n: 2, base: 50, iva: 10.5, retencion: 0, total: 60.5 });
  });
  it("CSV con separador «;», decimales con coma, BOM y campos escapados", () => {
    const csv = csvFacturasRecibidas([items[1]], () => "EXP-1");
    const lineas = csv.split("\n");
    expect(lineas[0].startsWith("﻿Fecha;Proveedor")).toBe(true);
    // «;» separa: una coma dentro del nombre no se entrecomilla (mismo criterio que el CSV de emitidas).
    // Las dos columnas vacías tras «10,50» son la retención de IRPF y su porcentaje (23/09/2026).
    expect(lineas[1]).toBe('02/08/2026;Alquiler, S.L.;B12345678;ES3700490001502310107890;A-1;Material;50,00;21;10,50;;;60,50;Pendiente;;;Subida;f.pdf;');
    expect(csvFacturasRecibidas([items[0]]).split("\n")[1]).toContain("EXP-1".length ? "Papelería Vallès" : "");
    expect(csvFacturasRecibidas([fila({ concepto: 'Con "comillas"; y punto y coma' })]).split("\n")[1]).toContain('"Con ""comillas""; y punto y coma"');
  });
  it("nombre de archivo en el ZIP: fecha_proveedor_numero_id.ext", () => {
    expect(nombreEnZip(items[1])).toBe("2026-08-02_Alquiler_S_L_A_1_b.pdf");
    expect(nombreEnZip(fila({ id: "zz", fecha: "", proveedorNombre: "", numero: "", archivoNombre: "foto.JPG", archivoMime: "image/jpeg" }))).toBe("sin-fecha_proveedor_zz.jpg");
  });
});

describe("facturas recibidas · pago", () => {
  it("el IBAN leído solo se guarda si es válido; si no, aviso", () => {
    const ok = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", total: 10, proveedor_iban: "es37 0049 0001 5023 1010 7890", confianza: 0.9 });
    expect(ok.campos.proveedorIban).toBe("ES3700490001502310107890");
    const mal = normalizarFacturaLeida({ es_factura: true, proveedor_nombre: "X", fecha: "2026-01-05", total: 10, proveedor_iban: "ES12 0049 0001 5023 1010 7890", confianza: 0.9 });
    expect(mal.campos.proveedorIban).toBe(""); expect(mal.avisos.some((a) => a.startsWith("IBAN leído no válido"))).toBe(true); expect(mal.revisar).toBe(true);
  });
  it("marcar pagada pone fecha de hoy si falta; volver a pendiente la quita", () => {
    const a = normalizarCamposEditados({ estado: "PAGADA" }); expect(a.estado).toBe("PAGADA"); expect(a.fechaPago).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const b = normalizarCamposEditados({ estado: "PAGADA", fechaPago: "5/9/2026" }); expect(b.fechaPago).toBe("2026-09-05");
    const c = normalizarCamposEditados({ estado: "PENDIENTE", fechaPago: "2026-09-05" }); expect(c.fechaPago).toBe("");
    expect(normalizarCamposEditados({ proveedorIban: "ES00 1234" }).proveedorIban).toBe("");
  });
  it("solo entra en una orden lo pendiente con importe e IBAN válido", () => {
    expect(motivoNoPagable(fila({}))).toBeNull();
    expect(motivoNoPagable(fila({ estado: "PAGADA" }))).toBe("ya pagada");
    expect(motivoNoPagable(fila({ total: null }))).toBe("sin importe");
    expect(motivoNoPagable(fila({ proveedorIban: "" }))).toBe("sin IBAN del proveedor");
  });
});

describe("facturas recibidas · escritura en base", () => {
  it("las fechas vacías van como null (columnas DATE), las informadas tal cual", () => {
    expect(camposParaDb({ fecha: "", fechaPago: "", numero: "A" })).toEqual({ fecha: null, fechaPago: null, numero: "A" });
    expect(camposParaDb({ fecha: "2026-09-03" })).toEqual({ fecha: "2026-09-03" });
    expect(camposParaDb({ numero: "B" })).toEqual({ numero: "B" });
  });
});

// RETENCIÓN DE IRPF (Luis, Asenjo, 23/09/2026). La factura del abogado o del alquiler
// resta la retención: base + IVA − retención = total. Antes de esto, TODAS esas facturas
// caían en «los importes no cuadran» y se marcaban para revisar sin motivo.
describe("retención de IRPF", () => {
  it("la lee, la guarda en positivo y el total cuadra", () => {
    const r = normalizarFacturaLeida({
      es_factura: true, confianza: 0.95, legible: true, proveedor_nombre: "Abogados Ruiz", fecha: "2026-09-10",
      base_imponible: 1000, tipo_iva: 21, cuota_iva: 210, retencion: -150, tipo_retencion: 15, total: 1060,
    });
    expect(r.campos.retencion).toBe(150);        // la factura la escribe restando; aquí en positivo
    expect(r.campos.tipoRetencion).toBe(15);
    expect(r.campos.total).toBe(1060);           // el importe A PAGAR: de aquí sale la transferencia
    expect(r.avisos).toEqual([]);                // ya no hay falso «no cuadran»
    expect(r.revisar).toBe(false);
  });

  it("deduce el importe desde el porcentaje, y el porcentaje desde el importe", () => {
    const a = normalizarFacturaLeida({ es_factura: true, confianza: 0.9, legible: true, proveedor_nombre: "X", fecha: "2026-09-10", base_imponible: 1000, tipo_iva: 21, tipo_retencion: 15 });
    expect(a.campos.retencion).toBe(150);
    expect(a.campos.total).toBe(1060);
    const b = normalizarFacturaLeida({ es_factura: true, confianza: 0.9, legible: true, proveedor_nombre: "X", fecha: "2026-09-10", base_imponible: 1000, tipo_iva: 21, cuota_iva: 210, retencion: 70, total: 1140 });
    expect(b.campos.tipoRetencion).toBe(7);
  });

  it("con retención NO despeja la base desde el total (daría una base falsa)", () => {
    const r = normalizarFacturaLeida({ es_factura: true, confianza: 0.9, legible: true, proveedor_nombre: "X", fecha: "2026-09-10", tipo_iva: 21, retencion: 150, total: 1060 });
    expect(r.campos.baseImponible).toBeNull();   // antes habría escrito 876,03 €
  });

  it("sigue avisando cuando de verdad no cuadra", () => {
    const r = normalizarFacturaLeida({ es_factura: true, confianza: 0.9, legible: true, proveedor_nombre: "X", fecha: "2026-09-10", base_imponible: 1000, tipo_iva: 21, cuota_iva: 210, retencion: 150, total: 1200 });
    expect(r.avisos.some((a) => /no cuadran/.test(a))).toBe(true);
  });

  it("sin retención nada cambia", () => {
    const r = normalizarFacturaLeida({ es_factura: true, confianza: 0.95, legible: true, proveedor_nombre: "Papelería", fecha: "2026-09-10", base_imponible: 100, tipo_iva: 21, cuota_iva: 21, total: 121 });
    expect(r.campos.retencion).toBeNull();
    expect(r.campos.tipoRetencion).toBeNull();
    expect(r.avisos).toEqual([]);
  });

  it("el resumen cuadra: base + IVA − retención = gasto", () => {
    const t = totalesDe([fila({ baseImponible: 1000, cuotaIva: 210, retencion: 150, total: 1060 })]);
    expect(t.base).toBe(1000);
    expect(t.iva).toBe(210);
    expect(t.retencion).toBe(150);
    expect(r2(t.base + t.iva - t.retencion)).toBe(t.total);
  });

  it("el gestor puede corregirla a mano, y el CSV la lleva", () => {
    expect(normalizarCamposEditados({ retencion: "150,00", tipoRetencion: "15" })).toEqual({ retencion: 150, tipoRetencion: 15 });
    expect(normalizarCamposEditados({ retencion: "" })).toEqual({ retencion: null });
    const csv = csvFacturasRecibidas([fila({ retencion: 150, tipoRetencion: 15, total: 1060 })]);
    expect(csv.split("\n")[0]).toContain("Retención IRPF");
    expect(csv.split("\n")[1]).toContain("150,00");
  });
});
