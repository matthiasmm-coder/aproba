import { describe, it, expect } from "vitest";
import { importesFactura, nifDeDocumento, type Factura } from "./facturas";
import { csvFacturasEmitidas, CABECERA_CSV_EMITIDAS } from "./facturas-csv";

// 23/09/2026 — la lista de Facturas, sus totales y el CSV calculaban totalDe(base) y se
// dejaban los suplidos (tasas): 13 facturas de un despacho real salían con 307,55 € de
// menos. Y el CSV no traía el NIF/CIF del cliente (pedido de Luis).

const base: Factura = { id: "f1", numero: "2026-0023", cliente: "Ana Pérez", concepto: "Renovación de TIE", base: 50, estado: "EMITIDA", fecha: "21/09/2026", origen: "MANUAL" };

describe("importesFactura", () => {
  it("manda el total guardado, suplidos incluidos", () => {
    const f = { ...base, iva: 10.5, total: 88.58, suplidos: [{ concepto: "Tasa 790-012", importe: 28.08 }] };
    expect(importesFactura(f)).toEqual({ base: 50, iva: 10.5, suplidos: 28.08, total: 88.58 });
  });

  it("sin total guardado, lo calcula con los suplidos (no base × 1,21)", () => {
    const f = { ...base, suplidos: [{ concepto: "Tasa", importe: 28.08 }] };
    expect(importesFactura(f).total).toBe(88.58);
  });

  it("una fila antigua sin lista de suplidos: la diferencia hasta el total son los suplidos", () => {
    const f = { ...base, iva: 10.5, total: 88.58 };
    expect(importesFactura(f)).toEqual({ base: 50, iva: 10.5, suplidos: 28.08, total: 88.58 });
  });

  it("una factura sin suplidos sigue igual", () => {
    expect(importesFactura({ ...base, iva: 10.5, total: 60.5 })).toEqual({ base: 50, iva: 10.5, suplidos: 0, total: 60.5 });
  });

  it("una rectificativa conserva el signo negativo en todo", () => {
    const f = { ...base, base: -50, iva: -10.5, total: -88.58, suplidos: [{ concepto: "Tasa", importe: -28.08 }] };
    expect(importesFactura(f)).toEqual({ base: -50, iva: -10.5, suplidos: -28.08, total: -88.58 });
  });
});

describe("nifDeDocumento", () => {
  it("quita la etiqueta del snapshot", () => {
    expect(nifDeDocumento("NIE/DNI X1234567L")).toBe("X1234567L");
    expect(nifDeDocumento("CIF/NIF B12345678")).toBe("B12345678");
  });
  it("un pasaporte conserva su etiqueta (no es un NIF)", () => {
    expect(nifDeDocumento("Pasaporte AB123456")).toBe("Pasaporte AB123456");
  });
  it("sin documento → vacío", () => {
    expect(nifDeDocumento(undefined)).toBe("");
    expect(nifDeDocumento(null)).toBe("");
  });
});

describe("csvFacturasEmitidas", () => {
  const f = { ...base, iva: 10.5, total: 88.58, suplidos: [{ concepto: "Tasa", importe: 28.08 }], clienteDatos: { documento: "NIE/DNI X1234567L" } };
  const csv = csvFacturasEmitidas([f]);
  const [cab, fila] = csv.replace(/^﻿/, "").split("\n");

  it("lleva BOM y la cabecera con NIF/CIF y Suplidos", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(cab).toBe(CABECERA_CSV_EMITIDAS.join(";"));
    expect(CABECERA_CSV_EMITIDAS).toContain("NIF/CIF");
    expect(CABECERA_CSV_EMITIDAS).toContain("Suplidos");
  });

  it("cada fila cuadra: Base + IVA + Suplidos = Total, con coma decimal", () => {
    expect(fila).toBe("2026-0023;21/09/2026;Ana Pérez;X1234567L;Renovación de TIE;50,00;10,50;28,08;88,58;Emitida;Manual");
  });

  it("escapa el separador y las comillas", () => {
    const raro = csvFacturasEmitidas([{ ...f, cliente: 'Talleres "Ebro"; S.L.' }]).split("\n")[1];
    expect(raro.split(";")[2]).toBe('"Talleres ""Ebro""');
    expect(raro).toContain('"Talleres ""Ebro""; S.L."');
  });

  it("sin datos fiscales, la columna NIF/CIF va vacía (no se inventa)", () => {
    const sin = csvFacturasEmitidas([{ ...f, clienteDatos: null }]).split("\n")[1].split(";");
    expect(sin[3]).toBe("");
  });
});
