import { describe, expect, it } from "vitest";
import { docsFamiliaPorServicios } from "./familia";

// Caso Juan: padre arraigo + madre renovación — cada uno sube SUS documentos,
// los comunes (empadronamiento, libro de familia…) una sola vez.
const ARRAIGO = { id: "arraigo_social", docs: ["Pasaporte completo", "Contrato de trabajo", "Empadronamiento histórico"] };
const RENOVACION = { id: "renovacion_tie", docs: ["Pasaporte completo", "TIE actual", "Libro de familia"] };
const PADRE = { id: "p1" };
const MADRE = { id: "m1" };

describe("docsFamiliaPorServicios", () => {
  it("dedup por TIPO: «Pasaporte» y «Pasaporte completo» entre servicios → una sola casilla", () => {
    const A = { id: "a", docs: ["Pasaporte", "Contrato de trabajo"] };
    const B = { id: "b", docs: ["Pasaporte completo", "TIE actual"] };
    const r = docsFamiliaPorServicios([A, B], null, [{ id: "m1" }]);
    expect(r.porMiembro.m1.filter((d) => d.toLowerCase().includes("pasaporte"))).toEqual(["Pasaporte"]);
  });

  it("dos documentos PERSONALIZADOS distintos (tipo OTRO) sobreviven ambos", () => {
    const A = { id: "a", docs: ["Carta de la parroquia", "Informe de arraigo del ayuntamiento"] };
    const r = docsFamiliaPorServicios([A], null, [{ id: "m1" }]);
    expect(r.porMiembro.m1).toEqual(["Carta de la parroquia", "Informe de arraigo del ayuntamiento"]);
  });

  it("menor de edad → sin antecedentes penales; adulto sí", () => {
    const A = { id: "a", docs: ["Pasaporte", "Antecedentes penales"] };
    const r = docsFamiliaPorServicios([A], null, [
      { id: "adulto", fechaNacimiento: "1990-01-01" },
      { id: "menor", fechaNacimiento: "2015-06-01" },
    ]);
    expect(r.porMiembro.adulto).toContain("Antecedentes penales");
    expect(r.porMiembro.menor).toEqual(["Pasaporte"]);
  });

  it("asigna a cada miembro los docs de SUS servicios y saca los comunes aparte", () => {
    const r = docsFamiliaPorServicios([ARRAIGO, RENOVACION], { arraigo_social: ["p1"], renovacion_tie: ["m1"] }, [PADRE, MADRE]);
    expect(r.comunes).toEqual(["Empadronamiento histórico", "Libro de familia"]);
    expect(r.porMiembro.p1).toEqual(["Pasaporte completo", "Contrato de trabajo"]);
    expect(r.porMiembro.m1).toEqual(["Pasaporte completo", "TIE actual"]);
  });

  it("sin asignación (retro-compat): todos los servicios aplican a todos", () => {
    const r = docsFamiliaPorServicios([ARRAIGO, RENOVACION], null, [PADRE, MADRE]);
    expect(r.porMiembro.p1).toEqual(["Pasaporte completo", "Contrato de trabajo", "TIE actual"]);
    expect(r.porMiembro.m1).toEqual(r.porMiembro.p1);
    expect(r.comunes).toEqual(["Empadronamiento histórico", "Libro de familia"]);
  });

  it("servicio sin entrada en la asignación → para todos; con entrada → solo los suyos", () => {
    const r = docsFamiliaPorServicios([ARRAIGO, RENOVACION], { renovacion_tie: ["m1"] }, [PADRE, MADRE]);
    expect(r.porMiembro.p1).toEqual(["Pasaporte completo", "Contrato de trabajo"]);
    expect(r.porMiembro.m1).toContain("TIE actual");
  });

  it("hoja de encargo / mandato nunca entran (van al bloque firma)", () => {
    const sv = { id: "x", docs: ["Hoja de encargo firmada", "Mandato de representación firmado", "Pasaporte"] };
    const r = docsFamiliaPorServicios([sv], null, [PADRE]);
    expect(r.comunes).toEqual([]);
    expect(r.porMiembro.p1).toEqual(["Pasaporte"]);
  });

  it("miembro asignado que no está en solicitantes no revienta; dedupe entre servicios", () => {
    const r = docsFamiliaPorServicios([ARRAIGO, RENOVACION], { arraigo_social: ["fantasma"] }, [MADRE]);
    expect(r.porMiembro.m1).toEqual(["Pasaporte completo", "TIE actual"]);
    expect(Object.keys(r.porMiembro)).toEqual(["m1"]);
  });
});
