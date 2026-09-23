import { describe, it, expect } from "vitest";
import { normalizarEstadoCobro, aplicarMapeo, type Mapeo } from "./importar";

// «Estado del cobro» de la migración (Luis, 24/09/2026): la plantilla trae si la factura
// ANTERIOR a Aproba está cobrada o pendiente. Lo negativo manda.

describe("normalizarEstadoCobro", () => {
  it("reconoce lo cobrado", () => {
    for (const v of ["Cobrada", "cobrado", "Pagada", "PAGADO", "Sí", "si", "S", "OK", "Abonada", "Cobrat"]) expect(normalizarEstadoCobro(v), v).toBe("COBRADA");
  });
  it("reconoce lo pendiente, también en negativo o parcial", () => {
    for (const v of ["Pendiente", "Pendiente de cobro", "No", "No cobrada", "no pagada", "Parcial", "Parcialmente cobrada", "Impagada", "Debe 200 €", "Por cobrar"]) expect(normalizarEstadoCobro(v), v).toBe("PENDIENTE");
  });
  it("lo que no entiende no lo inventa", () => {
    expect(normalizarEstadoCobro("")).toBeNull();
    expect(normalizarEstadoCobro("x")).toBeNull();
    expect(normalizarEstadoCobro("transferencia")).toBeNull();
  });
});

describe("aplicarMapeo con «Estado del cobro»", () => {
  const mapeo: Mapeo = {
    columnas: [{ indice: 0, campo: "nombre" }, { indice: 1, campo: "tramite" }, { indice: 2, campo: "estado" }, { indice: 3, campo: "importe" }, { indice: 4, campo: "estadoCobro" }],
    tramites: { "Arraigo social": "arraigo_social" }, validezMeses: {}, estados: { Resuelto: "RESUELTO", Presentado: "PRESENTADO" },
    crearHistorial: true, crearEnCurso: true, crearFamilias: false,
  };
  it("lleva el estado del cobro junto al importe, sin tocar el estado del trámite", () => {
    const [f] = aplicarMapeo([["Karim", "Arraigo social", "Resuelto", "390", "Pendiente"]], mapeo);
    expect(f.estado).toBe("RESUELTO");
    expect(f.importe).toBe(390);
    expect(f.estadoCobro).toBe("PENDIENTE");
    expect(f.avisos).toEqual([]);
  });
  it("vacío → sin estado del cobro (no se inventa «cobrada»)", () => {
    const [f] = aplicarMapeo([["Karim", "Arraigo social", "Resuelto", "390", ""]], mapeo);
    expect(f.estadoCobro).toBe("");
  });
  it("un valor que no entiende deja un aviso en la fila", () => {
    const [f] = aplicarMapeo([["Karim", "Arraigo social", "Resuelto", "390", "transferencia"]], mapeo);
    expect(f.estadoCobro).toBe("");
    expect(f.avisos.join(" ")).toMatch(/Estado del cobro no reconocido/);
  });
});
