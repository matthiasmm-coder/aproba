import { describe, it, expect } from "vitest";
import { tituloRepresentacion, partirDomicilioDespacho, presentadorDe, partirNombreProfesional, presentadorCompleto } from "./presentador";

// El bloque del despacho va en un formulario oficial: si se rellena mal, la Oficina de
// Extranjería lee que representa alguien que no es. De ahí que estas funciones no
// adivinen (la provincia se deja vacía) y que el bloque no se estampe a medias.

describe("tituloRepresentacion", () => {
  it("deduce el título del colegio que el despacho ya declara", () => {
    expect(tituloRepresentacion("Ilustre Colegio de Abogados de Madrid")).toBe("Abogado");
    // Corto a propósito: la casilla «Título» del impreso no da para más.
    expect(tituloRepresentacion("COLEGIO DE GESTORES DE CATALUÑA")).toBe("Gestor");
    expect(tituloRepresentacion("Colegio Oficial de Graduados Sociales de Valencia")).toBe("Graduado social");
  });
  it("sin colegio, no inventa una profesión", () => {
    expect(tituloRepresentacion(null, "4192")).toBe("Colegiado");
    expect(tituloRepresentacion(null, null)).toBe("Representante");
    expect(tituloRepresentacion("Asociación de algo")).toBe("Representante");
  });
});

describe("partirDomicilioDespacho", () => {
  it("separa vía, número, piso, C.P. y localidad", () => {
    expect(partirDomicilioDespacho("C/ Mallorca 245, 3º 2ª, 08013 Barcelona")).toEqual({ domicilio: "C/ Mallorca", numero: "245", piso: "3º2ª", cp: "08013", localidad: "Barcelona" });
  });
  it("sin C.P. no adivina la localidad", () => {
    expect(partirDomicilioDespacho("Gran Vía 30")).toEqual({ domicilio: "Gran Vía", numero: "30", piso: "", cp: "", localidad: "" });
  });
  it("vacío devuelve todo vacío", () => {
    expect(partirDomicilioDespacho(null).cp).toBe("");
  });
});

describe("presentadorDe", () => {
  const despacho = { nombre: "Asenjo Global Consulting SL", nif: "B12345678", domicilio: "C/ Mayor 1, 28013 Madrid", emailFacturacion: "info@asenjo.es", mandatarioNombre: "Marta Asenjo Romo", mandatarioDni: "02536751N", mandatarioColegio: "Ilustre Colegio de Abogados de Madrid", mandatarioColegiado: "64469" };
  it("toma los datos del despacho y deduce el título", () => {
    const p = presentadorDe(despacho)!;
    expect(p.nombre).toBe("Asenjo Global Consulting SL");
    expect(p.documento).toBe("B12345678");
    expect(p.localidad).toBe("Madrid");
    expect(p.repNombre).toBe("Marta Asenjo Romo");
    expect(p.repTitulo).toBe("Abogado");
    expect(p.provincia).toBe(""); // nunca se adivina
  });
  it("la oficina manda sobre el despacho cuando tiene datos propios", () => {
    const p = presentadorDe(despacho, { razonSocial: "Asenjo Barcelona SL", nif: "B99999999", telefono: "931112233", mandatarioNombre: "Vanesa Pérez", mandatarioDni: "11111111H", mandatarioColegio: "Colegio de Gestores de Cataluña" })!;
    expect(p.nombre).toBe("Asenjo Barcelona SL");
    expect(p.documento).toBe("B99999999");
    expect(p.telefono).toBe("931112233");
    expect(p.repTitulo).toBe("Gestor");
    expect(p.email).toBe("info@asenjo.es"); // lo que la oficina no define, lo hereda
  });
  it("sin razón social ni profesional no hay bloque", () => {
    expect(presentadorDe({ nif: "B1" })).toBeNull();
  });
  it("un bloque a medias no se considera completo", () => {
    expect(presentadorCompleto(presentadorDe({ nombre: "Despacho X" }))).toBe(false);
    expect(presentadorCompleto(presentadorDe(despacho))).toBe(true);
  });
});

describe("partirNombreProfesional", () => {
  it("primer token = nombre, el resto apellidos", () => {
    expect(partirNombreProfesional("Marta Asenjo Romo")).toEqual({ nombre: "Marta", apellidos: "Asenjo Romo" });
    expect(partirNombreProfesional("Andrés")).toEqual({ nombre: "Andrés", apellidos: "" });
  });
});
