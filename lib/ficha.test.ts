import { describe, it, expect } from "vitest";
import { camposQueFaltan, fichaVacia, type ClienteFicha } from "./ficha";

// El aviso de «faltan datos» existe porque el PDF salía incompleto EN SILENCIO
// (caso real: estado civil sin marcar porque la ficha lo tenía vacío).
describe("camposQueFaltan", () => {
  const completa = (): ClienteFicha => ({
    nombre: "María", apellidos: "García López", sexo: "M", estadoCivil: "S",
    fechaNacimiento: "1990-02-01", nacionalidad: "Colombia",
    lugarNacimiento: "Bogotá", paisNacimiento: "Colombia",
    numeroDocumento: "X1234567L", pasaporte: "AB123456",
    nombrePadre: "Juan", nombreMadre: "Ana",
    via: "Calle Mayor", numeroVia: "3", piso: "2A",
    codigoPostal: "08001", municipio: "Barcelona", provincia: "Barcelona",
    telefono: "600111222", email: "m@example.com",
  });

  it("no avisa de nada cuando la ficha está completa", () => {
    expect(camposQueFaltan(completa())).toEqual([]);
  });

  it("avisa del estado civil y del sexo vacíos (el caso que lo motivó)", () => {
    const f = { ...completa(), estadoCivil: "", sexo: "" };
    const faltan = camposQueFaltan(f);
    expect(faltan).toContain("Estado civil");
    expect(faltan).toContain("Sexo");
    expect(faltan).toHaveLength(2);
  });

  it("trata NIE y pasaporte como UNO: con uno de los dos no avisa", () => {
    expect(camposQueFaltan({ ...completa(), numeroDocumento: "" })).toEqual([]);
    expect(camposQueFaltan({ ...completa(), pasaporte: "" })).toEqual([]);
    expect(camposQueFaltan({ ...completa(), numeroDocumento: "", pasaporte: "" })).toContain("NIE o pasaporte");
  });

  it("no avisa del piso (falta legítimamente en muchas fichas)", () => {
    expect(camposQueFaltan({ ...completa(), piso: "" })).toEqual([]);
  });

  it("ignora los espacios en blanco (un campo con espacios está vacío)", () => {
    expect(camposQueFaltan({ ...completa(), nacionalidad: "   " })).toContain("Nacionalidad");
  });

  it("con la ficha vacía avisa de todo, sin duplicados y en orden estable", () => {
    const faltan = camposQueFaltan(fichaVacia());
    expect(faltan.length).toBeGreaterThan(10);
    expect(new Set(faltan).size).toBe(faltan.length);
    expect(faltan).toEqual(camposQueFaltan(fichaVacia()));
    expect(faltan[0]).toBe("Nombre"); // orden de la ficha, no alfabético
  });

  it("aguanta null/undefined sin romper", () => {
    expect(camposQueFaltan(null).length).toBeGreaterThan(0);
    expect(camposQueFaltan(undefined).length).toBeGreaterThan(0);
  });
});
