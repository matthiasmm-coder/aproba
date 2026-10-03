import { describe, it, expect } from "vitest";
import { filaTabla, csvTabla, cambiosTablaValidos, claveFiltroEstado, estadoVisible, estadoVisibleDe, ESTADO_TRAMITE, resolucionDe, salidaDeResolucion, type FilaTabla } from "./expedientes-tabla";

// Vista Tabla restaurada el 28/09/2026 (Jennifer). El nº oficial se prueba en numero-oficial.test.ts.

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
    tramitadoPor: "Marta Ribas", asignadoAId: null, colaborador: "", tasaGenerada: true, tasaPagadaEl: "", salida: null, archivado: false, ...p,
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

// «Preparado» en la tabla y en el filtro de la lista (Jennifer, 03/10/2026).
describe("estado visible: «Preparado» es la fase del tablero", () => {
  it("en preparación con formularios o tasa (fase «preparado») sale «Preparado»; lo presentado no cambia", () => {
    expect(estadoVisibleDe("EN_PREPARACION", "preparado")).toBe("PREPARADO");
    expect(estadoVisibleDe("EN_PREPARACION", "preparacion")).toBe("EN_PREPARACION");
    expect(estadoVisibleDe("DOCS_VALIDADOS", "preparado")).toBe("PREPARADO"); // estado antiguo → EN_PREPARACION
    expect(estadoVisibleDe("PRESENTADO", "preparado")).toBe("PRESENTADO");
    expect(ESTADO_TRAMITE[estadoVisibleDe("EN_PREPARACION", "preparado")]).toBe("Preparado");
  });
  it("el filtro junta «Resuelto» favorable y desfavorable, como la columna", () => {
    expect(claveFiltroEstado("RECHAZADO")).toBe("RESUELTO");
    expect(claveFiltroEstado("PREPARADO")).toBe("PREPARADO");
  });
  it("el Excel exportado dice «Preparado» cuando la fila lo es", () => {
    const f: FilaTabla = { id: "e9", referencia: "EXP-2026-0099", numeroOficial: "", nombre: "Ana Ruiz", nie: "X1", pasaporte: "", anio: "2026", fechaNacimiento: "", estado: "EN_PREPARACION", fechaPresentacion: "", tramitadoPor: "", asignadoAId: null, colaborador: "", tasaGenerada: true, tasaPagadaEl: "", salida: null, archivado: false, preparado: true };
    expect(csvTabla([f]).split("\n")[1]).toContain(";Preparado;");
    expect(estadoVisible({ estado: "EN_PREPARACION" })).toBe("EN_PREPARACION");
  });
});

// Tabla editable (Jennifer, 03/10/2026): colaborador, fecha de presentación, tasa pagada,
// tramitado por y resolución se escriben desde la celda.
describe("tabla editable", () => {
  const HOY = new Date("2026-10-03T10:00:00Z");
  it("valida lo que se guarda: texto limpio, fechas reales y no futuras, vacío = borrar", () => {
    expect(cambiosTablaValidos({ colaborador: "  Gestoría   Martí  " }, HOY)).toEqual({ colaborador: "Gestoría Martí" });
    expect(cambiosTablaValidos({ colaborador: "" }, HOY)).toEqual({ colaborador: null });
    expect(cambiosTablaValidos({ fechaPresentacion: "2026-09-28", tasaPagadaEl: null }, HOY)).toEqual({ fechaPresentacion: "2026-09-28", tasaPagadaEl: null });
    expect(cambiosTablaValidos({ fechaPresentacion: "2026-02-31" }, HOY)).toEqual({ error: "Fecha no válida." });
    expect(cambiosTablaValidos({ tasaPagadaEl: "2026-10-20" }, HOY)).toEqual({ error: "La fecha no puede ser futura." });
    expect(cambiosTablaValidos({ colaborador: "x".repeat(121) }, HOY)).toHaveProperty("error");
    expect(cambiosTablaValidos({ otra: 1 }, HOY)).toEqual({ error: "Nada que guardar." });
  });
  it("la resolución sale de la salida registrada (Favorable deja el estado en Finalizado)", () => {
    expect(resolucionDe({ estado: "FINALIZADO", salida: "concedido" })).toBe("Favorable");
    expect(resolucionDe({ estado: "RECHAZADO", salida: "denegado" })).toBe("No favorable");
    expect(resolucionDe({ estado: "EN_PREPARACION", salida: "desistido" })).toBe("Desistido");
    expect(resolucionDe({ estado: "RESUELTO", salida: null })).toBe("Favorable"); // estado antiguo
    expect(resolucionDe({ estado: "PRESENTADO", salida: "en_tramite" })).toBe("");
    expect(salidaDeResolucion({ estado: "RECHAZADO", salida: null })).toBe("denegado");
  });
  it("la fila lleva colaborador, tasa pagada, responsable y la fecha del evento si la columna está vacía", () => {
    const f = filaTabla({ id: "e3", referencia: "EXP-2026-0003", estado: "PRESENTADO", fechaPresentacion: null, createdAt: "2026-01-02T00:00:00Z", archivadoAt: null, tasaPath: "x.pdf",
      asignadoAId: "u1", colaborador: " Abogados Puig ", tasaPagadaEl: "2026-09-15", salida: null,
      cliente: { nombre: "Ana", apellidos: "Ruiz", numeroDocumento: "X1", pasaporte: null, fechaNacimiento: null }, empresa: null, asignadoA: { nombre: "Alexandra" } }, "2025-12-11T09:00:00Z");
    expect(f.fechaPresentacion).toBe("2025-12-11T09:00:00Z");
    expect(f.anio).toBe("2025");
    expect([f.colaborador, f.tasaPagadaEl, f.asignadoAId]).toEqual(["Abogados Puig", "2026-09-15", "u1"]);
  });
  it("el Excel lleva el colaborador y la tasa pagada con su fecha", () => {
    const f: FilaTabla = { id: "e4", referencia: "EXP-2026-0004", numeroOficial: "", nombre: "Ana Ruiz", nie: "X1", pasaporte: "", anio: "2026", fechaNacimiento: "", estado: "FINALIZADO", fechaPresentacion: "2026-08-01", tramitadoPor: "Alexandra", asignadoAId: "u1", colaborador: "Abogados Puig", tasaGenerada: true, tasaPagadaEl: "2026-07-30", salida: "concedido", archivado: true };
    expect(csvTabla([f]).split("\n")[1]).toBe("Ana Ruiz;X1;;2026;;Finalizado;01/08/2026;Alexandra;Abogados Puig;Favorable;Pagada 30/07/2026;EXP-2026-0004");
  });
});
