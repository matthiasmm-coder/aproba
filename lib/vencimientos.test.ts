import { describe, it, expect } from "vitest";
import { tipoVencimientoDeDocumento, VENCIMIENTO_POR_DOCUMENTO } from "./vencimientos";

describe("qué documento siembra un vencimiento", () => {
  // El fallo medido: 32 pasaportes con fecha de caducidad extraída y ninguno sembraba.
  it("el pasaporte siembra, no solo el TIE", () => {
    expect(tipoVencimientoDeDocumento("pasaporte")).toBe("PASAPORTE");
    expect(tipoVencimientoDeDocumento("tarjeta_residencia_tie")).toBe("TIE");
    expect(tipoVencimientoDeDocumento("certificado_nie")).toBe("NIE");
  });

  // Un contrato o una nómina tienen fechas que NO son vencimientos a vigilar.
  it("los documentos que no son de identidad no siembran nada", () => {
    for (const t of ["contrato_trabajo", "nomina", "empadronamiento", "certificado_bancario", "antecedentes_penales", "otro", "desconocido"]) {
      expect(tipoVencimientoDeDocumento(t)).toBeNull();
    }
  });

  it("no revienta con un tipo ausente", () => {
    expect(tipoVencimientoDeDocumento(null)).toBeNull();
    expect(tipoVencimientoDeDocumento(undefined)).toBeNull();
  });

  // Los tipos se enseñan tal cual en la lista de Vencimientos: nada de claves internas.
  it("los tipos son legibles para el gestor", () => {
    for (const v of Object.values(VENCIMIENTO_POR_DOCUMENTO)) expect(v).toMatch(/^[A-ZÁÉÍÓÚÑ]+$/);
  });
});
