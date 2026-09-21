import { describe, expect, it } from "vitest";
import { docsEmpresaPorTrabajador } from "./familia";

// Expediente DE EMPRESA: reparto de documentos por trabajador (21/09/2026).
const servicios = [{ id: "arraigo", docs: ["Pasaporte completo", "Certificado de empadronamiento", "Hoja de encargo firmada", "Mandato firmado", "Certificado de antecedentes penales"] }];
const hace = (anios: number) => new Date(Date.now() - anios * 365.25 * 864e5).toISOString().slice(0, 10);

describe("docsEmpresaPorTrabajador", () => {
  it("todo lo del servicio es de CADA trabajador; firma fuera; comunes vacíos", () => {
    const r = docsEmpresaPorTrabajador(servicios, null, [{ id: "a" }, { id: "b" }]);
    expect(r.comunes).toEqual([]);
    expect(r.porMiembro.a).toEqual(["Pasaporte completo", "Certificado de empadronamiento", "Certificado de antecedentes penales"]);
    expect(r.porMiembro.b).toEqual(r.porMiembro.a);
  });

  it("el empadronamiento NO es común (a diferencia de la familia)", () => {
    const r = docsEmpresaPorTrabajador(servicios, null, [{ id: "a" }]);
    expect(r.comunes).not.toContain("Certificado de empadronamiento");
    expect(r.porMiembro.a).toContain("Certificado de empadronamiento");
  });

  it("menor de edad: sin antecedentes penales", () => {
    const r = docsEmpresaPorTrabajador(servicios, null, [{ id: "m", fechaNacimiento: hace(16) }, { id: "a", fechaNacimiento: hace(30) }]);
    expect(r.porMiembro.m).not.toContain("Certificado de antecedentes penales");
    expect(r.porMiembro.a).toContain("Certificado de antecedentes penales");
  });

  it("asignación por servicio: solo los asignados reciben sus documentos", () => {
    const dos = [...servicios, { id: "renovacion", docs: ["TIE en vigor"] }];
    const r = docsEmpresaPorTrabajador(dos, { arraigo: ["a"], renovacion: ["b"] }, [{ id: "a" }, { id: "b" }]);
    expect(r.porMiembro.a).toContain("Pasaporte completo");
    expect(r.porMiembro.a).not.toContain("TIE en vigor");
    expect(r.porMiembro.b).toEqual(["TIE en vigor"]);
  });

  it("sin trabajadores: nada por persona y sin fallo", () => {
    const r = docsEmpresaPorTrabajador(servicios, null, []);
    expect(r.porMiembro).toEqual({});
    expect(r.comunes).toEqual([]);
  });
});
