import { describe, expect, it } from "vitest";
import { conceptoRectificativa, esNumeroRectificativa, importesRectificativa, prefijoRectificativa } from "./facturas";

// Factura rectificativa (RD 1619/2012, art. 15) — petición de Luis, 21/09/2026.
describe("serie propia de las rectificativas", () => {
  it("prefijo R, y R-<oficina> cuando la sede tiene el suyo", () => {
    expect(prefijoRectificativa()).toBe("R");
    expect(prefijoRectificativa("")).toBe("R");
    expect(prefijoRectificativa("  DG ")).toBe("R-DG");
  });
  it("la serie común nunca atrapa una rectificativa", () => {
    // El patrón de `emitidos()` ancla el principio: «2026-%» no matchea «R-2026-0001».
    expect("R-2026-0001".startsWith("2026-")).toBe(false);
    expect(esNumeroRectificativa("R-2026-0001")).toBe(true);
    expect(esNumeroRectificativa("R-DG-2026-0001")).toBe(true);
    expect(esNumeroRectificativa("2026-0006")).toBe(false);
  });
});

describe("importes de la rectificativa (por diferencia)", () => {
  it("el negativo del original: original + rectificativa = 0", () => {
    const r = importesRectificativa({ baseImponible: 70, iva: 14.7, total: 84.7 });
    expect(r).toMatchObject({ baseImponible: -70, iva: -14.7, total: -84.7 });
    expect(r.baseImponible + 70).toBe(0);
    expect(r.lineas).toBeNull();
    expect(r.suplidos).toBeNull();
  });
  it("niega también las líneas y los suplidos, conservando sus conceptos", () => {
    const r = importesRectificativa({
      baseImponible: 350, iva: 73.5, total: 461.78,
      lineas: [{ concepto: "Honorarios arraigo", base: 350 }],
      suplidos: [{ concepto: "Tasa 790-012", importe: 38.28 }],
    });
    expect(r.lineas).toEqual([{ concepto: "Honorarios arraigo", base: -350 }]);
    expect(r.suplidos).toEqual([{ concepto: "Tasa 790-012", importe: -38.28 }]);
  });
  it("rectificar algo ya negativo no lo vuelve positivo", () => {
    // Guarda de simetría: la ruta impide rectificar una rectificativa, pero si llegara
    // aquí un importe negativo el resultado no puede ser un cargo al cliente.
    expect(importesRectificativa({ baseImponible: -70, iva: -14.7, total: -84.7 }).total).toBe(-84.7);
  });
  it("redondea a dos decimales", () => {
    expect(importesRectificativa({ baseImponible: 33.333, iva: 7, total: 40.333 }).baseImponible).toBe(-33.33);
  });
});

describe("concepto de la rectificativa", () => {
  it("nombra siempre la factura rectificada", () => {
    expect(conceptoRectificativa("2026-0006")).toBe("Rectificativa de la factura 2026-0006");
    expect(conceptoRectificativa("2026-0006", "cliente equivocado")).toBe("Rectificativa de la factura 2026-0006 — cliente equivocado");
    expect(conceptoRectificativa("2026-0006", "   ")).toBe("Rectificativa de la factura 2026-0006");
  });
});
