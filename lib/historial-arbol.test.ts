import { describe, expect, it } from "vitest";
import { anioPorDefecto, aniosDelResumen, construirArbolHistorial, filtrarResumen, salidasDelResumen, totalResumen, type CatalogoLite } from "./historial-arbol";
import type { ResumenHistorial } from "./data/historial";

const CAT = new Map<string, CatalogoLite>([
  ["tie", { clave: "tie", label: "Renovación de TIE", tema: "Residencia" }],
  ["nie", { clave: "nie", label: "Asignación de NIE", tema: "residencia" }], // otra grafía
  ["nac", { clave: "nac", label: "Nacionalidad española", tema: "Nacionalidad" }],
  ["fnmt", { clave: "fnmt", label: "Certificado digital", tema: null }],     // sin tema
]);
const opciones = {
  catalogo: CAT, temas: ["Residencia", "Nacionalidad"],
  etiquetaSinClasificar: "Sin clasificar",
  etiquetaTipo: (t: string) => (t ? `Trámite ${t}` : ""),
};
const r = (x: Partial<ResumenHistorial>): ResumenHistorial =>
  ({ servicio: "tie", tipo: "RENOVACION", anio: "2024", salida: "concedido", asignado: "Marta Ribas", n: 1, ...x });

describe("árbol del archivo (recuentos del servidor)", () => {
  it("suma los recuentos en tema → servicio → año, sin perder ninguno", () => {
    const filas = [
      r({ anio: "2024", n: 40 }), r({ anio: "2023", n: 12 }),
      r({ servicio: "nie", anio: "2024", n: 7 }),
      r({ servicio: "nac", anio: "2019", n: 3 }),
      r({ servicio: "fnmt", tipo: "OTRO", anio: "2024", n: 2 }),
      r({ servicio: "", tipo: "OTRO", anio: "", n: 5 }),           // importado, sin fecha
    ];
    const arbol = construirArbolHistorial(filas, opciones);
    expect(totalResumen(filas)).toBe(69);
    expect(arbol.reduce((a, x) => a + x.n, 0)).toBe(69);
    // «Residencia» y «residencia» son una sola carpeta, titulada como en Ajustes.
    const res = arbol.find((x) => x.titulo === "Residencia")!;
    expect(res.n).toBe(59);
    expect(res.grupos.map((g) => g.nombre)).toEqual(["Asignación de NIE", "Renovación de TIE"]);
    expect(res.grupos.find((g) => g.nombre === "Renovación de TIE")!.n).toBe(52); // 2024 + 2023
  });

  it("los temas van en el orden de Ajustes, los servicios sin tema al final", () => {
    const arbol = construirArbolHistorial([
      r({ servicio: "fnmt", tipo: "OTRO" }), r({ servicio: "nac" }), r({ servicio: "tie" }),
      r({ servicio: "", tipo: "" }),
    ], opciones);
    expect(arbol.map((x) => x.titulo)).toEqual(["Residencia", "Nacionalidad", "Certificado digital", "Sin clasificar"]);
  });

  it("los años son un FILTRO: del más reciente al más antiguo, «sin fecha» al final", () => {
    const anios = aniosDelResumen([r({ anio: "2020", n: 1 }), r({ anio: "", n: 2 }), r({ anio: "2024", n: 5 })]);
    expect(anios).toEqual([{ anio: "2024", n: 5 }, { anio: "2020", n: 1 }, { anio: "", n: 2 }]);
  });

  it("al entrar se enseña el año corriente; si no tiene nada, el más reciente que sí", () => {
    const hoy = new Date("2026-09-19T10:00:00Z");
    expect(anioPorDefecto([{ anio: "2026", n: 3 }, { anio: "2024", n: 9 }], hoy)).toBe("2026");
    expect(anioPorDefecto([{ anio: "2024", n: 9 }, { anio: "2019", n: 2 }], hoy)).toBe("2024");
    expect(anioPorDefecto([], hoy)).toBeNull();
  });

  it("filtrar por año deja solo ese año, y la carpeta lleva la llave para pedir sus filas", () => {
    const filas = [r({ servicio: "nie", tipo: "NIE", anio: "2022", n: 4 }), r({ servicio: "nie", tipo: "NIE", anio: "2021", n: 7 })];
    const arbol = construirArbolHistorial(filtrarResumen(filas, { anio: "2022" }, CAT), opciones);
    expect(arbol[0].grupos[0]).toMatchObject({ servicio: "nie", tipo: "NIE", n: 4 });
  });

  it("cuenta las salidas para las pastillas", () => {
    const m = salidasDelResumen([
      r({ salida: "concedido", n: 5 }), r({ salida: "denegado", n: 2 }), r({ salida: "", n: 3 }),
    ]);
    expect(m.get("concedido")).toBe(5);
    expect(m.get("denegado")).toBe(2);
    expect(m.get("sin")).toBe(3);
  });

  it("filtra por salida, por responsable y por tema", () => {
    const filas = [
      r({ salida: "concedido", asignado: "Marta Ribas", n: 4 }),
      r({ salida: "denegado", asignado: "Diego Fuentes", n: 3 }),
      r({ servicio: "nac", salida: "concedido", asignado: "Diego Fuentes", n: 2 }),
      r({ servicio: "tie", salida: "", asignado: "", n: 1 }),
    ];
    expect(totalResumen(filtrarResumen(filas, { salida: "concedido" }, CAT))).toBe(6);
    expect(totalResumen(filtrarResumen(filas, { asignado: "Diego Fuentes" }, CAT))).toBe(5);
    expect(totalResumen(filtrarResumen(filas, { asignado: "Sin asignar" }, CAT))).toBe(1);
    expect(totalResumen(filtrarResumen(filas, { tema: "RESIDENCIA" }, CAT))).toBe(8);
    expect(totalResumen(filtrarResumen(filas, { salida: "sin" }, CAT))).toBe(1);
  });
});

describe("el archivo enseña las MISMAS carpetas que «En curso» (20/09)", () => {
  it("las carpetas sin nada archivado se pintan vacías, al final", () => {
    const arbol = construirArbolHistorial(
      [r({ servicio: "tie", anio: "2026", n: 2 })],
      { ...opciones, carpetasVacias: ["Arraigo", "Nacionalidad"] },
    );
    expect(arbol.map((x) => [x.titulo, x.n])).toEqual([["Residencia", 2], ["Arraigo", 0], ["Nacionalidad", 0]]);
  });

  it("y una carpeta que sí tiene archivo no se duplica", () => {
    const arbol = construirArbolHistorial([r({ servicio: "tie", n: 3 })], { ...opciones, carpetasVacias: ["residencia"] });
    expect(arbol).toHaveLength(1);
    expect(arbol[0].n).toBe(3);
  });
});
