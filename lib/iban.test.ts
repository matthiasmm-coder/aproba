import { describe, expect, it } from "vitest";
import { fmtIban, ibanOculto, ibanValido, IBAN_EJEMPLO } from "./iban";

describe("ibanOculto — lo que se ve en Ajustes sin pulsar «Ver datos»", () => {
  it("deja el país, los dígitos de control y las 4 últimas cifras", () => {
    expect(ibanOculto("ES9121000418450200051332")).toBe("ES91 •••• •••• •••• •••• 1332");
  });

  it("no filtra ninguna cifra del medio", () => {
    const oculto = ibanOculto(IBAN_EJEMPLO);
    for (const grupo of ["2100", "0418", "4502", "0005"]) expect(oculto).not.toContain(grupo);
  });

  it("acepta el IBAN con o sin espacios, y en minúsculas", () => {
    expect(ibanOculto(IBAN_EJEMPLO)).toBe("ES91 •••• •••• •••• •••• 1332");
    expect(ibanOculto("es91 2100 0418 4502 0005 1332")).toBe("ES91 •••• •••• •••• •••• 1332");
  });

  it("respeta longitudes de otros países (no asume 24 caracteres)", () => {
    expect(ibanOculto("FR7630006000011234567890189")).toBe("FR76 •••• •••• •••• •••• •••0 189"); // 27 caracteres
    expect(ibanOculto("BE68539007547034")).toBe("BE68 •••• •••• 7034");
  });

  it("un valor demasiado corto para ocultar se muestra tal cual (no inventa puntos)", () => {
    expect(ibanOculto("ES91 2100")).toBe("ES91 2100");
    expect(ibanOculto("")).toBe("");
  });

  it("revelado = el IBAN completo, agrupado de 4 en 4", () => {
    expect(fmtIban("ES9121000418450200051332")).toBe(IBAN_EJEMPLO);
    expect(ibanValido(IBAN_EJEMPLO)).toBe(true);
  });
});
