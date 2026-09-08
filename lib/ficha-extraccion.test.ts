import { describe, it, expect } from "vitest";
import { fichaDesdeCampos, fechaISO, sexoFicha, pideClienteNuevo, nombreEscrito, esDocumentoDeIdentidad, huecosDeFicha } from "./ficha-extraccion";
import { FICHA_KEYS } from "./ficha";

describe("ficha desde la extracción de un pasaporte", () => {
  it("mapea nombre, apellidos, sexo ICAO, nacionalidad, fecha y número", () => {
    const f = fichaDesdeCampos([
      { label: "Nombre", value: "DANIEL" }, { label: "Apellidos", value: "RAMÍREZ SOTO" }, { label: "Sexo", value: "M" },
      { label: "Nacionalidad", value: "COLOMBIA" }, { label: "Fecha de nacimiento", value: "12/03/1991" }, { label: "Nº pasaporte", value: "AV 123456" },
    ]);
    expect(f).toMatchObject({ nombre: "Daniel", apellidos: "Ramírez Soto", sexo: "H", nacionalidad: "Colombia", fechaNacimiento: "1991-03-12", pasaporte: "AV123456", paisNacimiento: "Colombia" });
  });
  it("un NIE va a numeroDocumento, nunca a pasaporte; F es mujer", () => {
    const f = fichaDesdeCampos([{ label: "Nombre completo", value: "FATIMA EL AMRANI" }, { label: "NIE", value: "Y-0429317-K" }, { label: "Nº documento", value: "Y0429317K" }, { label: "Sexo", value: "F" }]);
    expect(f).toMatchObject({ nombre: "Fatima", apellidos: "El Amrani", numeroDocumento: "Y0429317K", sexo: "M" });
    expect(f.pasaporte).toBeUndefined();
  });
  it("fechas en varios formatos y valores vacíos", () => {
    expect(fechaISO("14 MAR 1992")).toBe("1992-03-14"); expect(fechaISO("1992-03-14")).toBe("1992-03-14"); expect(fechaISO("14.3.1992")).toBe("1992-03-14"); expect(fechaISO("ayer")).toBeUndefined();
    expect(sexoFicha("Mujer")).toBe("M"); expect(sexoFicha("Hombre")).toBe("H"); expect(sexoFicha("")).toBeUndefined();
    expect(fichaDesdeCampos([{ label: "Nombre", value: "N/A" }]).nombre).toBeUndefined();
  });
  it("reconoce la orden «es nuevo» y el nombre escrito por el gestor", () => {
    expect(pideClienteNuevo("Es nuevo: Daniel Ramírez Soto")).toBe(true);
    expect(pideClienteNuevo("Es de Fatima")).toBe(false);
    expect(nombreEscrito("Cliente nuevo: Daniel Ramírez Soto, gracias")).toEqual({ nombre: "Daniel", apellidos: "Ramírez Soto" });
    expect(nombreEscrito("es nuevo")).toBeNull();
    expect(esDocumentoDeIdentidad("pasaporte")).toBe(true); expect(esDocumentoDeIdentidad("contrato_trabajo")).toBe(false);
  });
});

// ── Sincronización ficha ← extracción (08/09/2026, queja de Asenjo Global) ──────────
describe("huecosDeFicha", () => {
  const leido = {
    nombre: "Aicha", apellidos: "Diallo Diaz", sexo: "M" as const, fechaNacimiento: "1992-03-14",
    nacionalidad: "Senegalesa", numeroDocumento: "Y1234567L", municipio: "Barcelona",
  };

  it("rellena solo lo que está vacío", () => {
    const actual = { nombre: "Aïcha", apellidos: "", fechaNacimiento: null, municipio: "   " };
    expect(huecosDeFicha(actual, leido)).toEqual({
      apellidos: "Diallo Diaz", sexo: "M", fechaNacimiento: "1992-03-14",
      nacionalidad: "Senegalesa", numeroDocumento: "Y1234567L", municipio: "Barcelona",
    });
  });

  it("NUNCA pisa un dato escrito por una persona, aunque la IA lea otra cosa", () => {
    const actual = { nombre: "Aicha", apellidos: "Diallo", numeroDocumento: "X9999999R", fechaNacimiento: "1990-01-01" };
    const huecos = huecosDeFicha(actual, leido);
    expect(huecos.nombre).toBeUndefined();
    expect(huecos.apellidos).toBeUndefined();
    expect(huecos.numeroDocumento).toBeUndefined();
    expect(huecos.fechaNacimiento).toBeUndefined();
  });

  it("ficha completa o extracción vacía → nada que escribir", () => {
    expect(huecosDeFicha({ nombre: "A", apellidos: "B" }, {})).toEqual({});
    expect(huecosDeFicha(null, {})).toEqual({});
  });

  it("todas las claves que produce vienen de la ficha oficial (nada inventado)", () => {
    const claves = Object.keys(huecosDeFicha({}, leido));
    for (const k of claves) expect(FICHA_KEYS, `«${k}» no es un campo de la ficha`).toContain(k);
  });
});
