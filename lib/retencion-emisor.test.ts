import { describe, expect, it } from "vitest";
import { aCobrar, importesRectificativa, pctRetencion, retencionDe } from "./facturas";
import { importeTarjetaCuadra, saldoTarjeta } from "./entregas";
import { resumir, type MovEmitida } from "./estadisticas-facturacion";
import { puedeCrearOficina, tieneExcepcionOficinas } from "./oficinas";
import { conEmisorFijado } from "./facturacion-oficina";

// 28/09/2026 — Asenjo: Marta Asenjo (abogada, autónoma) emite desde el despacho con su NIF, sobre
// todo a AGC (la sociedad). Sus facturas llevan retención de IRPF; cada factura congela su emisor.

describe("retención de IRPF en facturas emitidas", () => {
  it("se calcula sobre la base de honorarios y no toca el total", () => {
    expect(retencionDe(2000, 15)).toBe(300);
    expect(retencionDe(1234.56, 7)).toBe(86.42);
    expect(retencionDe(2000, null)).toBe(0);
    expect(aCobrar({ total: 2420, retencion: 300 })).toBe(2120);
    expect(aCobrar({ total: 121 })).toBe(121);      // sin retención: el total de siempre
  });
  it("solo admite tipos razonables (0 < % ≤ 50), con coma o punto", () => {
    expect(pctRetencion("15")).toBe(15);
    expect(pctRetencion("7,5")).toBe(7.5);
    for (const v of [0, "0", -15, 51, "abc", null, undefined, ""]) expect(pctRetencion(v)).toBeNull();
  });
  it("una rectificativa niega también la retención (original + rectificativa = 0)", () => {
    const r = importesRectificativa({ baseImponible: 2000, iva: 420, total: 2420, retencion: 300 });
    expect(r).toMatchObject({ baseImponible: -2000, iva: -420, total: -2420, retencion: -300 });
    expect(aCobrar({ total: 2420, retencion: 300 }) + aCobrar(r)).toBe(0);
    expect(importesRectificativa({ baseImponible: 100, iva: 21, total: 121 }).retencion).toBeNull();
  });
});

describe("cobro con tarjeta: una sola definición del importe", () => {
  const f = { total: 2420, retencion: 300 };
  it("cobra total − retención − lo ya entregado", () => {
    expect(saldoTarjeta(f)).toBe(2120);
    expect(saldoTarjeta(f, [{ importe: 1000 }])).toBe(1120);
    expect(saldoTarjeta({ total: 121 }, [{ importe: 21 }])).toBe(100);
    expect(saldoTarjeta(f, [{ importe: 5000 }])).toBe(0);   // nunca negativo
  });
  it("da por bueno el saldo de hoy o el importe entero; nada más", () => {
    expect(importeTarjetaCuadra(112000, f, [{ importe: 1000 }])).toBe(true);   // pago del saldo (antes: rechazado)
    expect(importeTarjetaCuadra(212000, f, [{ importe: 1000 }])).toBe(true);   // enlace creado antes de la entrega
    expect(importeTarjetaCuadra(242000, f, [])).toBe(false);                   // el total fiscal NO: sobraría la retención
    expect(importeTarjetaCuadra(null, f, [])).toBe(false);
  });
});

describe("estadísticas: la retención nunca queda «pendiente»", () => {
  const mov = (o: Partial<MovEmitida>): MovEmitida => ({ fecha: "2026-09-28", base: 2000, iva: 420, total: 2420, cobrado: 0, cliente: "AGC", fuente: "APROBA", ...o });
  it("pagada entera: cobrado = total − retención, pendiente 0, retención aparte", () => {
    const r = resumir([mov({ retencion: 300, cobrado: 2120 })], []);
    expect(r.ingresos).toMatchObject({ total: 2420, cobrado: 2120, pendiente: 0, retenciones: 300, base: 2000 });
  });
  it("sin cobrar: pendiente = lo que el cliente pagará", () => {
    expect(resumir([mov({ retencion: 300 })], []).ingresos.pendiente).toBe(2120);
  });
  it("sin retención, todo como antes", () => {
    expect(resumir([mov({})], []).ingresos).toMatchObject({ pendiente: 2420, retenciones: 0 });
  });
});

describe("excepción comercial de oficinas (sin Business)", () => {
  const ASENJO = "367a2240-8c86-40ed-82a0-52e8d9c96011";
  it("Asenjo: una oficina emisora más en Pro, y no dos", () => {
    expect(tieneExcepcionOficinas(ASENJO)).toBe(true);
    expect(puedeCrearOficina("PRO", ASENJO, 1)).toBe(true);
    expect(puedeCrearOficina("PRO", ASENJO, 2)).toBe(false);
  });
  it("cualquier otro despacho en Pro: no; en Business: sí", () => {
    expect(puedeCrearOficina("PRO", "otro-ws", 1)).toBe(false);
    expect(puedeCrearOficina("STARTER", "otro-ws", 0)).toBe(false);
    expect(puedeCrearOficina("BUSINESS", "otro-ws", 7)).toBe(true);
  });
});

describe("emisor congelado al emitir", () => {
  const vivo = { nombre: "ASENJO GLOBAL CONSULTING SL", nif: "B24875403", domicilio: "Rivas", email: "info@agc.es", logo: "x.png" };
  it("manda el fijado (nombre, NIF, domicilio, email); el logo sigue siendo el actual", () => {
    const e = conEmisorFijado(vivo, { nombre: "Marta Asenjo Romo", nif: "12345678Z", domicilio: "Madrid", email: null });
    expect(e).toEqual({ ...vivo, nombre: "Marta Asenjo Romo", nif: "12345678Z", domicilio: "Madrid", email: null });
  });
  it("una factura anterior (sin fijar) sigue con el vivo", () => {
    expect(conEmisorFijado(vivo, null)).toBe(vivo);
    expect(conEmisorFijado(vivo, { nombre: "  ", nif: null, domicilio: null, email: null })).toBe(vivo);
  });
});
