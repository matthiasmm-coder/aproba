import { describe, it, expect } from "vitest";
import { normalizarNumeroOficial, faltaParaConsultar, filaTabla, csvTabla, MAX_NUMERO_OFICIAL, type FilaTabla } from "./expedientes-tabla";

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

describe("fila de la tabla", () => {
  it("lleva el nº oficial y cae en la banda del año de presentación", () => {
    const f = filaTabla({ id: "e1", referencia: "EXP-2026-0001", numeroOficial: "BA/9/2025", estado: "RESUELTO", fechaPresentacion: "2025-11-04T09:00:00Z", createdAt: "2026-01-10T00:00:00Z", archivadoAt: null, tasaPath: null, cliente: { nombre: "Ana", apellidos: "Ruiz", numeroDocumento: "X1", pasaporte: null, fechaNacimiento: "1990-01-10" }, empresa: null, asignadoA: { nombre: "Marta" } });
    expect(f.numeroOficial).toBe("BA/9/2025");
    expect(f.anio).toBe("2025");
    expect(f.nombre).toBe("Ana Ruiz");
  });
  it("antes de la migración la columna no llega: queda vacía, sin romper", () => {
    const f = filaTabla({ id: "e2", referencia: "EXP-2026-0002", estado: "EN_PREPARACION", fechaPresentacion: null, createdAt: "2026-02-01T00:00:00Z", archivadoAt: null, tasaPath: null, cliente: null, empresa: { razonSocial: "Delta S.L." }, asignadoA: null });
    expect(f.numeroOficial).toBe("");
    expect(f.nombre).toBe("Delta S.L.");
  });
});

describe("exportar la tabla a Excel", () => {
  const fila = (p: Partial<FilaTabla>): FilaTabla => ({
    id: "e1", referencia: "EXP-2026-0031", numeroOficial: "08/123456/2026", nombre: "Oksana Koval", nie: "X4241199E", pasaporte: "",
    anio: "2026", fechaNacimiento: "1993-10-27", estado: "PRESENTADO", fechaPresentacion: "2026-08-22T09:00:00Z",
    tramitadoPor: "Marta Ribas", tasaGenerada: true, archivado: false, ...p,
  });
  it("BOM + «;» + cabecera en el orden de la pantalla", () => {
    const csv = csvTabla([fila({})]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\n")[0]).toBe("\uFEFFNombre completo;NIE;Nº expediente;Año;Fecha de nacimiento;Estado de trámite;Fecha de presentación;Tramitado por;Colaborador;Resolución;Tasa;Referencia Aproba");
  });
  it("una fila por expediente, fechas en dd/mm/aaaa", () => {
    expect(csvTabla([fila({})]).split("\n")[1]).toBe("Oksana Koval;X4241199E;08/123456/2026;2026;27/10/1993;Presentado;22/08/2026;Marta Ribas;;;Generada;EXP-2026-0031");
  });
  it("resolución en palabras, pasaporte si no hay NIE, y escapa el «;»", () => {
    const l = csvTabla([fila({ estado: "RECHAZADO", nie: "", pasaporte: "AB123", nombre: "Ruiz; Ana", tasaGenerada: false })]).split("\n")[1];
    expect(l.startsWith('"Ruiz; Ana";AB123;')).toBe(true);
    expect(l).toContain(";No favorable;");
  });
  it("sin filas, solo la cabecera", () => {
    expect(csvTabla([]).split("\n")).toHaveLength(1);
  });
});
