import { describe, it, expect } from "vitest";
import { partirFecha006, partirDomicilio006, IMPORTE_006 } from "./tasa790006";

// Helpers puros de la tasa 790-006 (antecedentes penales). El mapping del impreso oficial
// se verifica contra la Sede real con scripts/probe-tasa006.mjs (hay red allí, aquí no):
// ese probe comprueba que cada dato cae en su fila y que la casilla «17. Antecedentes
// Penales» queda marcada en el ejemplar aplanado y viva en el editable.

describe("partirFecha006", () => {
  it("acepta dd/mm/aaaa bien formada", () => {
    expect(partirFecha006("07/03/1990")).toEqual({ d: "07", m: "03", a: "1990" });
    expect(partirFecha006("18/09/2026")).toEqual({ d: "18", m: "09", a: "2026" });
  });
  it("rechaza formatos y valores imposibles", () => {
    for (const v of ["7/3/1990", "1990-03-07", "32/01/2000", "01/13/2000", "", "hoy"]) {
      expect(partirFecha006(v)).toBeNull();
    }
  });
});

describe("partirDomicilio006", () => {
  it("separa vía / número / piso", () => {
    expect(partirDomicilio006("C/ Mallorca 245, 3º 2ª")).toEqual({ domicilio: "C/ Mallorca", numero: "245", piso: "3º2ª" });
  });
  it("sin número ni piso deja la vía intacta", () => {
    expect(partirDomicilio006("Plaza Mayor")).toEqual({ domicilio: "Plaza Mayor", numero: "", piso: "" });
  });
});

describe("importe", () => {
  // Comprobado el 18/09/2026 en la guía oficial del Ministerio de Justicia. El impreso es
  // una autoliquidación: pagar de más o de menos invalida el ingreso, así que el importe
  // va explícito (y editable en el modal), nunca calculado.
  it("es el oficial del certificado de antecedentes penales", () => {
    expect(IMPORTE_006).toBe("3,86");
  });
});
