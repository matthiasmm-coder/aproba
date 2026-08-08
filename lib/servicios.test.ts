import { describe, expect, it } from "vitest";
import { fmtPct } from "./servicios";
import { parsePacks } from "./data/config";

describe("fmtPct", () => {
  it("quita los decimales de ruido y usa coma", () => {
    expect(fmtPct(1.5)).toBe("1,5");
    expect(fmtPct(2)).toBe("2");
    expect(fmtPct(0.25)).toBe("0,25");
    expect(fmtPct(10.999)).toBe("11");
  });
});

describe("parsePacks", () => {
  it("acepta el formato guardado por guardarPacks", () => {
    const packs = parsePacks([
      { id: "pack_a", nombre: "Pack Compraventa", desc: "Todo incluido", servicioIds: ["nie", "arraigo_social"], precioDesde: 900, precioOculto: false },
    ]);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ id: "pack_a", nombre: "Pack Compraventa", servicioIds: ["nie", "arraigo_social"], precioDesde: 900 });
    expect(packs[0].precioOculto).toBeUndefined();
  });

  it("descarta basura sin romper (jsonb corrupto, columna ausente…)", () => {
    expect(parsePacks(null)).toEqual([]);
    expect(parsePacks("no-array")).toEqual([]);
    expect(parsePacks([null, 42, { nombre: "sin id" }, { id: "x" }])).toEqual([]);
    // precioDesde inválido → 0; servicioIds no-array → []
    const [p] = parsePacks([{ id: "p1", nombre: "P", servicioIds: "nope", precioDesde: "abc" }]);
    expect(p.precioDesde).toBe(0);
    expect(p.servicioIds).toEqual([]);
  });
});
