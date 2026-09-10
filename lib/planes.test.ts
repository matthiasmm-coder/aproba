import { describe, it, expect } from "vitest";
import { preciosPantalla, preciosDeTabla, PRECIOS_HEREDADOS, PLANES } from "./planes";

// Muro de pago (10/09/2026): Jennifer (Business, tarifa heredada 199 €) leyó «299 €/mes»
// en pantalla mientras el checkout le iba a cobrar 199 €, y escribió para preguntar dónde
// estaba su precio. La pantalla debe enseñar la tarifa DEL despacho, no la pública.
describe("muro de pago · precios que se enseñan", () => {
  it("un despacho nuevo ve la tarifa pública (anual = 10 × mensual, «2 meses gratis»)", () => {
    const p = preciosPantalla(false);
    expect(p.STARTER).toEqual({ mensual: 79, anual: 790 });
    expect(p.PRO).toEqual({ mensual: 149, anual: 1490 });
    expect(p.BUSINESS).toEqual({ mensual: 299, anual: 2990 });
    expect(p.PRO.mensual).toBe(PLANES.PRO.precio);
  });

  it("un heredado ve SU tarifa (49/99/199), no la pública", () => {
    const p = preciosPantalla(true);
    expect(p.STARTER).toEqual({ mensual: 49, anual: 490 });
    expect(p.PRO).toEqual({ mensual: 99, anual: 990 });
    expect(p.BUSINESS).toEqual({ mensual: 199, anual: 1990 });
  });

  it("el importe real de Stripe manda sobre la tabla, plan por plan y ciclo por ciclo", () => {
    const p = preciosPantalla(true, { BUSINESS: { mensual: 189 } });
    expect(p.BUSINESS).toEqual({ mensual: 189, anual: 1990 }); // el anual no venía → tabla
    expect(p.PRO).toEqual({ mensual: 99, anual: 990 });         // otro plan intacto
  });

  it("un importe inválido de Stripe (0, NaN, negativo, null) no pisa la tabla", () => {
    const p = preciosPantalla(false, { PRO: { mensual: 0, anual: NaN }, STARTER: { mensual: -5 }, BUSINESS: { mensual: undefined } });
    expect(p.PRO).toEqual({ mensual: 149, anual: 1490 });
    expect(p.STARTER.mensual).toBe(79);
    expect(p.BUSINESS.mensual).toBe(299);
  });

  it("sin datos de Stripe (null) se comporta como la tabla", () => {
    expect(preciosPantalla(true, null)).toEqual(preciosDeTabla(true));
    expect(preciosPantalla(false, undefined)).toEqual(preciosDeTabla(false));
  });

  it("la tabla heredada es exactamente la tarifa anterior a la subida del 04/09/2026", () => {
    expect(PRECIOS_HEREDADOS).toEqual({ STARTER: 49, PRO: 99, BUSINESS: 199 });
  });
});
