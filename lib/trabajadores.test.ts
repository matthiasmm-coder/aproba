import { describe, expect, it } from "vitest";
import { esExpedienteDeEmpresa, etiquetaTrabajadores, motivoNoQuitar, nombreCompleto, presentados, unidadesFacturables } from "./trabajadores";

describe("expediente de empresa (modelo nuevo vs. trabajador con empresa pagadora)", () => {
  it("es de empresa solo con empresa y SIN titular persona", () => {
    expect(esExpedienteDeEmpresa({ empresaId: "e1", clienteId: null })).toBe(true);
    expect(esExpedienteDeEmpresa({ empresaId: "e1", clienteId: undefined })).toBe(true);
    // Modelo anterior: la persona sigue siendo el titular → NO es «de empresa».
    expect(esExpedienteDeEmpresa({ empresaId: "e1", clienteId: "c1" })).toBe(false);
    expect(esExpedienteDeEmpresa({ empresaId: null, clienteId: "c1" })).toBe(false);
    expect(esExpedienteDeEmpresa({ empresaId: null, clienteId: null })).toBe(false);
  });

  it("nombre completo sin espacios sobrantes", () => {
    expect(nombreCompleto({ nombre: "Amadou", apellidos: "Ba" })).toBe("Amadou Ba");
    expect(nombreCompleto({ nombre: "Amadou", apellidos: null })).toBe("Amadou");
    expect(nombreCompleto({ nombre: "Amadou" })).toBe("Amadou");
  });
});

describe("tarifa por trabajador", () => {
  it("nunca factura 0 unidades: sin trabajadores, una", () => {
    expect(unidadesFacturables(0)).toBe(1);
    expect(unidadesFacturables(1)).toBe(1);
    expect(unidadesFacturables(4)).toBe(4);
    expect(unidadesFacturables(2.9)).toBe(2);
  });
});

describe("presentados por trabajador", () => {
  it("cuenta los que tienen fecha", () => {
    expect(presentados([{ presentadoAt: "2026-09-21" }, { presentadoAt: null }, { presentadoAt: "2026-09-20" }])).toEqual({ n: 2, total: 3 });
    expect(presentados([])).toEqual({ n: 0, total: 0 });
  });
});

describe("quitar un trabajador", () => {
  it("se puede si no dejó rastro; si no, dice qué falta", () => {
    expect(motivoNoQuitar({ nDocumentos: 0, nFormularios: 0 })).toBeNull();
    expect(motivoNoQuitar({ nDocumentos: 2, nFormularios: 0 })).toMatch(/documentos/);
    expect(motivoNoQuitar({ nDocumentos: 0, nFormularios: 1 })).toMatch(/formularios/);
    // Los documentos mandan sobre los formularios (primer obstáculo que ve el gestor).
    expect(motivoNoQuitar({ nDocumentos: 1, nFormularios: 1 })).toMatch(/documentos/);
  });
});

describe("etiqueta de trabajadores", () => {
  it("singular, plural y vacío", () => {
    expect(etiquetaTrabajadores(0)).toBe("sin trabajadores todavía");
    expect(etiquetaTrabajadores(1)).toBe("1 trabajador");
    expect(etiquetaTrabajadores(3)).toBe("3 trabajadores");
    // Traducción por el mismo `t` de la app.
    expect(etiquetaTrabajadores(3, (s) => (s === "trabajadores" ? "treballadors" : s))).toBe("3 treballadors");
  });
});
