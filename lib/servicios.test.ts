import { describe, expect, it } from "vitest";
import { agruparPorTema, fmtPct, packPct, packPrecio, temasUsados, type Pack } from "./servicios";
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

describe("agruparPorTema", () => {
  const S = (id: string, categoria?: string) => ({ id, categoria });

  it("agrupa respetando el orden del catálogo (el tema aparece donde su primer elemento)", () => {
    const g = agruparPorTema([S("a", "Empresa"), S("b", "Nacionalidad"), S("c", "Empresa")]);
    expect(g.map((x) => x.titulo)).toEqual(["Empresa", "Nacionalidad"]);
    expect(g[0].items.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("mismo tema aunque cambien acentos, mayúsculas o espacios — muestra la primera grafía", () => {
    const g = agruparPorTema([S("a", "Nacionalidad"), S("b", " nacionalidád ")]);
    expect(g).toHaveLength(1);
    expect(g[0].titulo).toBe("Nacionalidad");
    expect(g[0].items).toHaveLength(2);
  });

  it("los servicios sin tema van SIEMPRE al final, con clave vacía", () => {
    const g = agruparPorTema([S("sin"), S("a", "Empresa"), S("otro")]);
    expect(g.map((x) => x.clave)).toEqual(["empresa", ""]);
    expect(g[1].items.map((x) => x.id)).toEqual(["sin", "otro"]);
  });

  it("catálogo sin ningún tema → un solo grupo vacío (el portal cae en lista plana)", () => {
    const g = agruparPorTema([S("a"), S("b")]);
    expect(g).toHaveLength(1);
    expect(g[0].clave).toBe("");
  });
});

describe("temasUsados", () => {
  it("deduplica por tema normalizado y conserva el orden y la grafía original", () => {
    const servicios = [{ categoria: "Empresa" }, { categoria: "nacionalidad" }, { categoria: "EMPRESA" }];
    const packs = [{ categoria: "Nacionalidad" }, { categoria: "Familia" }];
    expect(temasUsados(servicios, packs)).toEqual(["Empresa", "nacionalidad", "Familia"]);
  });

  it("ignora los vacíos", () => {
    expect(temasUsados([{ categoria: "" }, { categoria: undefined }, {}])).toEqual([]);
  });
});

describe("precio de un pack (suma de sus servicios − descuento)", () => {
  const cat = [
    { id: "a", precio: 500 },
    { id: "b", precio: 420 },
    { id: "c", precio: 600 },
  ];
  const pk = (extra: Partial<Pack> = {}): Pack =>
    ({ id: "p", nombre: "P", desc: "", servicioIds: ["a", "b"], precioDesde: 0, ...extra }) as Pack;

  it("sin descuento el total es la suma", () => {
    expect(packPrecio(pk(), cat)).toEqual({ suma: 920, total: 920, pct: 0 });
  });

  it("aplica el porcentaje y redondea a céntimos", () => {
    expect(packPrecio(pk({ descuentoPct: 15 }), cat)).toEqual({ suma: 920, total: 782, pct: 15 });
    expect(packPrecio(pk({ descuentoPct: 33 }), cat).total).toBe(616.4);
  });

  it("ignora los servicios que ya no existen en el catálogo", () => {
    expect(packPrecio(pk({ servicioIds: ["a", "borrado"] }), cat).suma).toBe(500);
  });

  it("satura el porcentaje: nada por debajo de 0 ni por encima de 100", () => {
    expect(packPct(pk({ descuentoPct: -20 }))).toBe(0);
    expect(packPct(pk({ descuentoPct: 250 }))).toBe(100);
    expect(packPrecio(pk({ descuentoPct: 250 }), cat).total).toBe(0); // nunca negativo
  });

  it("parsePacks lee el descuento y descarta lo inválido", () => {
    expect(parsePacks([{ id: "p1", nombre: "P", servicioIds: [], descuentoPct: 20 }])[0].descuentoPct).toBe(20);
    expect(parsePacks([{ id: "p2", nombre: "P", servicioIds: [], descuentoPct: "abc" }])[0].descuentoPct).toBeUndefined();
  });
});
