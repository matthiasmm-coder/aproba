import { describe, it, expect } from "vitest";
import { datosFiscalesDeEmpresa, clienteEncargoDeEmpresa, normalizaNif, nombreEmpresa } from "./empresa";

// Cliente-empresa: la factura y la hoja de encargo van a la EMPRESA (CIF + domicilio
// fiscal), nunca al trabajador. Estas son las dos transformaciones que lo garantizan.
const EMP = { razonSocial: "Construcciones Ebro SL", nif: "b-12345678", domicilio: "Pol. Ind. Norte, nave 4", codigoPostal: "50014", municipio: "Zaragoza", provincia: "Zaragoza", contactoNombre: "Marta Pérez", contactoEmail: "rrhh@ebro.es", contactoTelefono: "976000000" };

describe("datosFiscalesDeEmpresa", () => {
  it("snapshot con CIF normalizado y dirección fiscal", () => {
    expect(datosFiscalesDeEmpresa(EMP)).toEqual({ documento: "CIF/NIF B12345678", direccion: "Pol. Ind. Norte, nave 4 · 50014 Zaragoza" });
  });
  it("provincia distinta del municipio → entre paréntesis; sin nada → null", () => {
    expect(datosFiscalesDeEmpresa({ ...EMP, municipio: "Utebo" })?.direccion).toBe("Pol. Ind. Norte, nave 4 · 50014 Utebo (Zaragoza)");
    expect(datosFiscalesDeEmpresa({ razonSocial: "X" })).toBeNull();
    expect(datosFiscalesDeEmpresa(null)).toBeNull();
  });
});

describe("clienteEncargoDeEmpresa", () => {
  it("la razón social ocupa el nombre y el CIF el hueco del NIE; contacto = el de la empresa", () => {
    const c = clienteEncargoDeEmpresa(EMP);
    expect(c.nombre).toBe("Construcciones Ebro SL");
    expect(c.apellidos).toBe("");
    expect(c.nie).toBe("B12345678");
    expect(c.email).toBe("rrhh@ebro.es");
    expect(c.telefono).toBe("976000000");
  });
});

describe("helpers", () => {
  it("normalizaNif y nombreEmpresa", () => {
    expect(normalizaNif(" b 1234-5678 ")).toBe("B12345678");
    expect(nombreEmpresa({ razonSocial: "  Acme  " })).toBe("Acme");
    expect(nombreEmpresa(null)).toBe("Empresa");
  });
});
