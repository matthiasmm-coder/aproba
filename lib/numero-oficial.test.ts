import { describe, it, expect } from "vitest";
import { normalizarNumeroOficial, faltaParaConsultar, MAX_NUMERO_OFICIAL } from "./numero-oficial";

describe("nº de expediente oficial", () => {
  it("se guarda limpio: sin espacios sobrantes y en mayúsculas", () => {
    expect(normalizarNumeroOficial("  ba/12345/2026 ")).toBe("BA/12345/2026");
    expect(normalizarNumeroOficial("0800 2026   0012345")).toBe("0800 2026 0012345");
  });
  it("vacío o nulo = borrarlo", () => {
    expect(normalizarNumeroOficial("")).toBe("");
    expect(normalizarNumeroOficial("   ")).toBe("");
    expect(normalizarNumeroOficial(null)).toBe("");
  });
  it("se corta a 60 caracteres", () => {
    expect(normalizarNumeroOficial("x".repeat(90))).toHaveLength(MAX_NUMERO_OFICIAL);
  });
});

describe("qué falta para consultar el estado en Extranjería", () => {
  const base = { nie: "X1234567L", numeroOficial: "", fechaPresentacion: "2026-08-22T09:00:00Z", fechaNacimiento: "1993-10-27" };
  it("con NIE, fecha de presentación y año de nacimiento, nada", () => {
    expect(faltaParaConsultar(base)).toEqual([]);
  });
  it("el nº de expediente sustituye al NIE (la web oficial busca por cualquiera de los dos)", () => {
    expect(faltaParaConsultar({ ...base, nie: "", numeroOficial: "BA/1/2026" })).toEqual([]);
    expect(faltaParaConsultar({ ...base, nie: "", numeroOficial: "" })).toEqual(["NIE o nº de expediente"]);
  });
  it("sin presentar no se puede consultar", () => {
    expect(faltaParaConsultar({ ...base, fechaPresentacion: "" })).toEqual(["fecha de presentación"]);
  });
});
