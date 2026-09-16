import { describe, it, expect } from "vitest";
import { generarPain001, ibanValido, limpiarIban, textoSepa, validarOrden, totalOrden, type OrdenSepa } from "./sepa";

const orden: OrdenSepa = {
  msgId: "APROBA-20260916-ABC123", creado: new Date("2026-09-16T10:00:00Z"),
  ordenante: { nombre: "Gestoría Vallès, S.L.", nif: "B66123456", iban: "ES91 2100 0418 4502 0005 1332" },
  fechaEjecucion: "2026-09-17",
  transferencias: [
    { endToEndId: "FR-2026-0147", importe: 296.45, acreedor: "Suministros Oficina Norte, S.L.", iban: "ES3700490001502310107890", concepto: "Factura 2026-0147 papel y tóner" },
    { endToEndId: "FR-77", importe: 60.5, acreedor: "Alquiler & Cía <Madrid>", iban: "ES9121000418450200051332", concepto: "Alquiler septiembre" },
  ],
};

describe("IBAN", () => {
  it("valida por mod 97 y longitud española", () => {
    expect(ibanValido("ES91 2100 0418 4502 0005 1332")).toBe(true);
    expect(ibanValido("ES3700490001502310107890")).toBe(true);
    expect(ibanValido("ES1200490001502310107890")).toBe(false); // dígitos de control incorrectos
    expect(ibanValido("ES91210004184502000513")).toBe(false);   // corto
    expect(ibanValido("DE89370400440532013000")).toBe(true);    // otro país, solo mod 97
    expect(ibanValido("")).toBe(false);
  });
  it("limpia espacios, guiones y minúsculas", () => {
    expect(limpiarIban("es91 2100-0418 4502 0005 1332")).toBe("ES9121000418450200051332");
  });
});

describe("pain.001", () => {
  it("texto SEPA: sin acentos ni símbolos prohibidos, acotado", () => {
    expect(textoSepa("Gestoría Vallès, S.L. & Cía <x>", 70)).toBe("Gestoria Valles, S.L. Cia x");
    expect(textoSepa("", 10)).toBe("-");
    expect(textoSepa("a".repeat(100), 35)).toHaveLength(35);
  });
  it("genera un fichero con cabecera, ordenante, N transferencias y sumas de control", () => {
    const x = generarPain001(orden);
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(x).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
    expect(x).toContain("<NbOfTxs>2</NbOfTxs>");
    expect((x.match(/<CtrlSum>356.95<\/CtrlSum>/g) ?? []).length).toBe(2);
    expect(x).toContain("<IBAN>ES9121000418450200051332</IBAN>");
    expect(x).toContain("<Nm>Gestoria Valles, S.L.</Nm>");
    expect(x).toContain("<Id><OrgId><Othr><Id>B66123456</Id></Othr></OrgId></Id>");
    expect(x).toContain('<InstdAmt Ccy="EUR">296.45</InstdAmt>');
    expect(x).toContain("<Nm>Alquiler Cia Madrid</Nm>");
    expect(x).toContain("<ReqdExctnDt>2026-09-17</ReqdExctnDt>");
    expect(x).toContain("<EndToEndId>FR-2026-0147</EndToEndId>");
    expect(x).toContain("<Ustrd>Factura 2026-0147 papel y toner</Ustrd>");
    expect(x).not.toContain("&");
    expect(totalOrden(orden)).toBe(356.95);
  });
  it("rechaza IBAN o importes malos antes de escribir", () => {
    expect(validarOrden(orden)).toEqual([]);
    const mala = { ...orden, ordenante: { ...orden.ordenante, iban: "ES00" }, transferencias: [{ ...orden.transferencias[0], importe: 0, iban: "XX" }] };
    const e = validarOrden(mala);
    expect(e.some((m) => m.includes("IBAN del despacho"))).toBe(true);
    expect(e.some((m) => m.includes("importe no válido"))).toBe(true);
    expect(e.some((m) => m.includes("IBAN no válido"))).toBe(true);
    expect(validarOrden({ ...orden, transferencias: [] })).toContain("No hay transferencias.");
  });
});
