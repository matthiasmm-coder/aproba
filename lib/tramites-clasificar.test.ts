import { describe, expect, it } from "vitest";
import { clasificarDeteccion } from "./tramites";

// El resolutor de la subida en lote (23/08): detección IA → (docTipo, label, requerido).
describe("clasificarDeteccion (subida en lote)", () => {
  const requeridos = ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo", "Antecedentes penales"];

  it("una detección conocida cae en su casilla requerida, con el label del servicio", () => {
    expect(clasificarDeteccion("empadronamiento", requeridos)).toEqual({
      docTipo: "EMPADRONAMIENTO", label: "Certificado de empadronamiento", requerido: true,
    });
    expect(clasificarDeteccion("pasaporte", requeridos)).toEqual({
      docTipo: "PASAPORTE", label: "Pasaporte", requerido: true,
    });
  });

  it("respeta el label PERSONALIZADO del gestor (resuelve por docTipo, no por igualdad)", () => {
    const r = clasificarDeteccion("certificado_bancario", ["Justificante de medios económicos"]);
    expect(r).toEqual({ docTipo: "CERTIFICADO_BANCARIO", label: "Justificante de medios económicos", requerido: true });
  });

  it("una detección conocida FUERA de los requeridos usa el label del catálogo", () => {
    expect(clasificarDeteccion("nomina", requeridos)).toEqual({ docTipo: "NOMINA", label: "Nómina", requerido: false });
  });

  it("otro / desconocido → OTRO, nunca requerido", () => {
    for (const d of ["otro", "desconocido", "algo_inventado"]) {
      const r = clasificarDeteccion(d, requeridos);
      expect(r.docTipo).toBe("OTRO");
      expect(r.label).toBe("Otro documento");
      expect(r.requerido).toBe(false);
    }
  });

  it("sin requeridos configurados, todo cae en el label genérico del catálogo", () => {
    expect(clasificarDeteccion("pasaporte", [])).toEqual({ docTipo: "PASAPORTE", label: "Pasaporte", requerido: false });
  });
});
