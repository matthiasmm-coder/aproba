import { describe, it, expect } from "vitest";
import { partirFecha, partirDomicilio026, soloDigitos, IMPORTE_026, MESES_026 } from "./tasa790026";

// Helpers puros de la tasa 790-026. El mapping del impreso oficial (casillas por
// columna, campos AcroForm) se verifica con scripts/probe-tasa026.mjs contra la Sede
// real — aquí no hay red: solo la lógica que trocea fechas, CP y domicilios.

describe("partirFecha", () => {
  it("acepta dd/mm/aaaa bien formada", () => {
    expect(partirFecha("07/03/1990")).toEqual({ d: "07", m: "03", a: "1990" });
    expect(partirFecha("28/08/2026")).toEqual({ d: "28", m: "08", a: "2026" });
  });
  it("rechaza formatos y valores imposibles", () => {
    for (const v of ["7/3/1990", "1990-03-07", "32/01/2000", "01/13/2000", "", "hoy"]) {
      expect(partirFecha(v)).toBeNull();
    }
  });
  it("el mes mapea al desplegable oficial", () => {
    const f = partirFecha("28/08/2026")!;
    expect(MESES_026[+f.m - 1]).toBe("Agosto");
  });
});

describe("partirDomicilio026", () => {
  it("separa vía / número / piso", () => {
    expect(partirDomicilio026("C/ Mallorca 245, 3º 2ª")).toEqual({ domicilio: "C/ Mallorca", numero: "245", piso: "3º2ª" });
  });
  it("sin número ni piso deja la vía intacta", () => {
    expect(partirDomicilio026("Plaza Mayor")).toEqual({ domicilio: "Plaza Mayor", numero: "", piso: "" });
  });
});

describe("soloDigitos", () => {
  it("limpia el C.P. para las casillas de un dígito", () => {
    expect(soloDigitos("08013")).toBe("08013");
    expect(soloDigitos("08-013 ")).toBe("08013");
  });
});

describe("importe", () => {
  it("104,05 € — el vigente al implementarse (28/08/2026)", () => {
    expect(IMPORTE_026).toBe("104,05");
  });
});
