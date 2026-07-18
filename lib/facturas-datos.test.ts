import { describe, expect, it } from "vitest";
import { datosFiscalesDeCliente } from "./facturas";

describe("datosFiscalesDeCliente", () => {
  it("NIE prioritario sobre pasaporte, dirección completa con piso", () => {
    expect(datosFiscalesDeCliente({
      numeroDocumento: "Y7654321X", pasaporte: "AB123456",
      via: "Calle Mallorca", numeroVia: "21", piso: "2ºB",
      codigoPostal: "08013", municipio: "Barcelona", provincia: "Barcelona",
    })).toEqual({ documento: "NIE/DNI Y7654321X", direccion: "Calle Mallorca, 21, 2ºB · 08013 Barcelona" });
  });
  it("pasaporte como repli; provincia distinta entre paréntesis", () => {
    expect(datosFiscalesDeCliente({
      pasaporte: "AB123456", via: "Av. del Mar", numeroVia: "3",
      codigoPostal: "08380", municipio: "Malgrat de Mar", provincia: "Barcelona",
    })).toEqual({ documento: "Pasaporte AB123456", direccion: "Av. del Mar, 3 · 08380 Malgrat de Mar (Barcelona)" });
  });
  it("solo documento, solo dirección, o nada → null", () => {
    expect(datosFiscalesDeCliente({ numeroDocumento: "X1" })).toEqual({ documento: "NIE/DNI X1" });
    expect(datosFiscalesDeCliente({ municipio: "Girona" })).toEqual({ direccion: "Girona" });
    expect(datosFiscalesDeCliente({})).toBeNull();
    expect(datosFiscalesDeCliente(null)).toBeNull();
    expect(datosFiscalesDeCliente({ numeroDocumento: "  ", via: " " })).toBeNull();
  });
});
