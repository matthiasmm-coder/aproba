import { describe, it, expect } from "vitest";
import { datosFiscalesManuales, documentoSinEtiqueta } from "./facturas";

// 24/09/2026 — la factura manual 2026-0006 de Luis salió sin NIF: «+ Nueva factura» no lo
// pedía. Ahora el gestor lo escribe (o elige el cliente) y queda congelado en la factura.

describe("datosFiscalesManuales", () => {
  it("un CIF español → «CIF/NIF», normalizado", () => {
    expect(datosFiscalesManuales(" b-8242.2015 ", "")).toEqual({ documento: "CIF/NIF B82422015" });
  });
  it("un NIE o un DNI → «NIE/DNI»", () => {
    expect(datosFiscalesManuales("x1234567l", null)?.documento).toBe("NIE/DNI X1234567L");
    expect(datosFiscalesManuales("12345678Z", null)?.documento).toBe("NIE/DNI 12345678Z");
  });
  it("cualquier otro documento → pasaporte", () => {
    expect(datosFiscalesManuales("AB 123456", null)?.documento).toBe("Pasaporte AB123456");
  });
  it("si el gestor escribe la etiqueta, no se duplica", () => {
    expect(datosFiscalesManuales("CIF B82422015", null)?.documento).toBe("CIF/NIF B82422015");
    expect(datosFiscalesManuales("Pasaporte AB123456", null)?.documento).toBe("Pasaporte AB123456");
  });
  it("la dirección se guarda en una línea", () => {
    expect(datosFiscalesManuales("", "  Calle Mayor 12,\n 28001 Madrid ")).toEqual({ direccion: "Calle Mayor 12, 28001 Madrid" });
  });
  it("sin nada → null (la factura sigue sin datos, no se inventan)", () => {
    expect(datosFiscalesManuales("", "")).toBeNull();
    expect(datosFiscalesManuales(null, undefined)).toBeNull();
  });
  it("ida y vuelta: el campo del formulario recibe el número sin etiqueta", () => {
    for (const d of ["CIF/NIF B82422015", "NIE/DNI X1234567L", "Pasaporte AB123456"]) {
      expect(datosFiscalesManuales(documentoSinEtiqueta(d), null)?.documento).toBe(d);
    }
  });
});
