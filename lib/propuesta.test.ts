import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generarPropuestaPDF, personasDeEquipo } from "./propuesta";

describe("personasDeEquipo", () => {
  it("mapea las etiquetas del select", () => {
    expect(personasDeEquipo("Autónomo (solo yo)")).toEqual({ n: 1, abierto: false });
    expect(personasDeEquipo("3 personas")).toEqual({ n: 3, abierto: false });
    expect(personasDeEquipo("Más de 5")).toEqual({ n: 6, abierto: true });
    expect(personasDeEquipo("basura")).toEqual({ n: 1, abierto: false });
  });
});

describe("propuesta PDF", () => {
  // La promesa del documento: UNA página, incluso con los datos más largos plausibles.
  it("una sola página para solo / 3 personas / más de 5, con nombres kilométricos", async () => {
    for (const equipo of ["Autónomo (solo yo)", "3 personas", "Más de 5"]) {
      const bytes = await generarPropuestaPDF({
        nombre: "María del Carmen", apellidos: "Fernández de la Torre Iglesias",
        despacho: "Gestoría Internacional de Extranjería y Asesoría Fiscal SLU",
        email: "contacto@gestoria-ejemplo-con-nombre-largo.com", telefono: "600 123 456", equipo,
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  }, 30000);
});
