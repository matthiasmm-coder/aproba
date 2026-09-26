import { describe, expect, it } from "vitest";
import { MODELOS, PAGINAS_MODELOS, tramitesDelModelo } from "@/lib/formularios-paginas";
import { PAGINAS_TASAS, TASAS_PAGINAS, tramitesDeTasa } from "@/lib/tasas-paginas";
import { FORM_LABEL, formularioOficialDisponible } from "@/lib/ex-forms";
import { TASAS } from "@/lib/tasas";
import { TRAMITES } from "@/lib/tramites-paginas";

// Las páginas de modelo y de tasa copian lo que hace el producto: si un modelo deja de
// generarse o cambia de nombre, esto falla antes de que la página mienta.
describe("páginas de modelo oficial", () => {
  it("cubren exactamente los modelos que Aproba genera", () => {
    expect(MODELOS.map((m) => m.code).sort()).toEqual(Object.keys(FORM_LABEL).sort());
  });
  it.each(MODELOS.map((m) => [m.code, m] as const))("%s · disponible y con su nombre oficial", (code, m) => {
    expect(formularioOficialDisponible(code), `${code} en FORMS`).toBe(true);
    expect(m.nombre).toBe(FORM_LABEL[code]);
    expect(m.slug).toBe(code.toLowerCase());
  });
  it("los trámites de cada modelo se derivan del catálogo", () => {
    for (const m of MODELOS) {
      const esperados = TRAMITES.filter((t) => t.formularios.some((f) => f.code === m.code)).map((t) => t.slug);
      expect(tramitesDelModelo(m.code).map((t) => t.slug)).toEqual(esperados);
    }
  });
  it("títulos ≤ 65, descripciones ≤ 160, rutas únicas", () => {
    for (const p of PAGINAS_MODELOS) {
      expect(p.titulo.length, p.ruta).toBeLessThanOrEqual(65);
      expect(p.descripcion.length, p.ruta).toBeLessThanOrEqual(160);
    }
    expect(new Set(PAGINAS_MODELOS.map((p) => p.ruta)).size).toBe(PAGINAS_MODELOS.length);
  });
});

describe("páginas de tasa", () => {
  it("cubren las cinco tasas que el producto genera", () => {
    expect(TASAS_PAGINAS.map((t) => t.code).sort()).toEqual(TASAS.map((t) => t.code).sort());
  });
  it("los trámites de cada tasa se derivan del catálogo", () => {
    for (const t of TASAS_PAGINAS) {
      const esperados = TRAMITES.filter((x) => x.tasas.includes(t.code)).map((x) => x.slug);
      expect(tramitesDeTasa(t.code).map((x) => x.slug)).toEqual(esperados);
    }
  });
  it("títulos ≤ 65, descripciones ≤ 160, rutas únicas", () => {
    for (const p of PAGINAS_TASAS) {
      expect(p.titulo.length, p.ruta).toBeLessThanOrEqual(65);
      expect(p.descripcion.length, p.ruta).toBeLessThanOrEqual(160);
    }
    expect(new Set(PAGINAS_TASAS.map((p) => p.ruta)).size).toBe(PAGINAS_TASAS.length);
  });
});

// 26/09/2026: ninguna ficha de modelo depende solo del índice /formularios. Recibe enlaces
// de sus vecinas (cadena anterior/siguiente) y de los trámites que la usan.
import { PAGINAS_MODELOS as _PM, MODELOS as _M, otrosModelos } from "@/lib/formularios-paginas";
import { PAGINAS_TRAMITES as _PT } from "@/lib/tramites-paginas";
describe("fichas de modelo · enlazado interno", () => {
  const enlacesA = (ruta: string) => [..._PM, ..._PT].filter((p) => p.ruta !== ruta && JSON.stringify(p.bloques).includes(`](${ruta})`)).length;
  it.each(_M.map((m) => [m.code, m] as const))("%s recibe al menos 2 enlaces de otras fichas o trámites", (_c, m) => {
    expect(enlacesA(`/formularios/${m.slug}`)).toBeGreaterThanOrEqual(2);
  });
  it("«Otros modelos» solo enlaza fichas que existen, nunca a sí misma, 6 como mucho", () => {
    for (const m of _M) {
      const o = otrosModelos(m);
      expect(o.length).toBeGreaterThan(0);
      expect(o.length).toBeLessThanOrEqual(6);
      expect(o.some((x) => x.code === m.code)).toBe(false);
    }
  });
});
