import { describe, expect, it } from "vitest";
import { aplicarDescuento, descuentoValido, etiquetaDescuento } from "./multi-servicio";

// Invariante central del descuento: anticipo + resto == bruto − rebaja AL CÉNTIMO,
// en todas las combinaciones (el realineado de facturas compara totales exactos).

describe("descuentoValido", () => {
  it("acepta porcentaje 1-100 y rechaza fuera de rango", () => {
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 10 })).toEqual({ tipo: "PORCENTAJE", valor: 10 });
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 0 })).toBeNull();
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 101 })).toBeNull();
  });
  it("redondea el importe y rechaza los que quedan en 0", () => {
    expect(descuentoValido({ tipo: "IMPORTE", valor: 99.999 })).toEqual({ tipo: "IMPORTE", valor: 100 });
    expect(descuentoValido({ tipo: "IMPORTE", valor: 0.004 })).toBeNull();
  });
  it("rechaza Infinity/NaN y basura", () => {
    expect(descuentoValido({ tipo: "IMPORTE", valor: Infinity })).toBeNull();
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: NaN })).toBeNull();
    expect(descuentoValido(null)).toBeNull();
    expect(descuentoValido("10%")).toBeNull();
  });
  it("recorta el motivo y omite el vacío", () => {
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 5, motivo: "  pack  " })).toEqual({ tipo: "PORCENTAJE", valor: 5, motivo: "pack" });
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 5, motivo: "   " })).toEqual({ tipo: "PORCENTAJE", valor: 5 });
  });
});

describe("aplicarDescuento", () => {
  it("sin descuento devuelve el bruto ×N", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, null)).toEqual({ anticipo: 150, resto: 200, bruto: 350, rebaja: 0 });
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 3, undefined)).toEqual({ anticipo: 450, resto: 600, bruto: 1050, rebaja: 0 });
  });
  it("porcentaje simple (el caso del e2e: 150/200 al −10 %)", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "PORCENTAJE", valor: 10 }))
      .toEqual({ anticipo: 135, resto: 180, bruto: 350, rebaja: 35 });
  });
  it("importe con familia: reparto proporcional exacto (3×150/200 −100 €)", () => {
    const r = aplicarDescuento({ anticipo: 150, resto: 200 }, 3, { tipo: "IMPORTE", valor: 100 });
    expect(r).toEqual({ anticipo: 407.14, resto: 542.86, bruto: 1050, rebaja: 100 });
    expect(Math.round((r.anticipo + r.resto) * 100)).toBe(95000); // == bruto − rebaja exacto
  });
  it("importe mayor que el bruto se recorta (total 0, nunca negativo)", () => {
    const r = aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "IMPORTE", valor: 5000 });
    expect(r).toEqual({ anticipo: 0, resto: 0, bruto: 350, rebaja: 350 });
  });
  it("anticipo 0: toda la rebaja cae en el resto", () => {
    expect(aplicarDescuento({ anticipo: 0, resto: 350 }, 1, { tipo: "PORCENTAJE", valor: 10 }))
      .toEqual({ anticipo: 0, resto: 315, bruto: 350, rebaja: 35 });
  });
  it("céntimos conflictivos: anticipo+resto == total exacto (33,33/33,33 al −10 %)", () => {
    const r = aplicarDescuento({ anticipo: 33.33, resto: 33.33 }, 1, { tipo: "PORCENTAJE", valor: 10 });
    expect(Math.round((r.anticipo + r.resto) * 100)).toBe(Math.round((r.bruto - r.rebaja) * 100));
  });
  it("descuento inválido se ignora (bruto intacto)", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "PORCENTAJE", valor: 0 } as never).rebaja).toBe(0);
  });
});

describe("etiquetaDescuento", () => {
  it("porcentaje e importe con separador de miles", () => {
    expect(etiquetaDescuento({ tipo: "PORCENTAJE", valor: 10 })).toBe("−10 %");
    expect(etiquetaDescuento({ tipo: "IMPORTE", valor: 150 })).toBe("−150,00 €");
    expect(etiquetaDescuento({ tipo: "IMPORTE", valor: 1500 })).toBe("−1.500,00 €");
  });
  it("vacía si el descuento no es válido", () => {
    expect(etiquetaDescuento(null)).toBe("");
    expect(etiquetaDescuento({ tipo: "PORCENTAJE", valor: 0 } as never)).toBe("");
  });
});
