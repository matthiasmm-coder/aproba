import { describe, it, expect } from "vitest";
import { agruparPagos, cobroDePagos, conceptoDeNotas, conceptoUtil, detectarPagos, marcaDePago, sinMarcaDePago, type FilaPago } from "./historial-pagos";

describe("servicios migrados: concepto y pagos", () => {
  it("el concepto sale de la 1ª línea de las notas, sin «Factura:»", () => {
    expect(conceptoDeNotas("Factura: CUENTA AJENA – BAKARY MANNEH")).toBe("CUENTA AJENA – BAKARY MANNEH");
    expect(conceptoDeNotas("Factura:  Desplazamientos   rumanos\notra línea")).toBe("Desplazamientos rumanos");
    expect(conceptoDeNotas("  ")).toBeNull();
    expect(conceptoDeNotas(null)).toBeNull();
  });

  it("un concepto que solo repite el servicio no se enseña", () => {
    const regul = "Autorización de residencia temporal por circunstancias excepcionales (Regularización 2026)";
    expect(conceptoUtil("REGULARIZACION 2026", regul)).toBeNull();
    expect(conceptoUtil("TRAMITE REGULARIZACION", regul)).toBeNull();
    expect(conceptoUtil("REGULARIZACION 2026 X2", regul)).toBe("REGULARIZACION 2026 X2");
    expect(conceptoUtil("NACIONALIDAD ESPAÑOLA", "Nacionalidad española por residencia")).toBeNull();
    expect(conceptoUtil("CUENTA AJENA – BAKARY MANNEH", "Residencia y trabajo por cuenta ajena")).toBe("CUENTA AJENA – BAKARY MANNEH");
    expect(conceptoUtil("", "x")).toBeNull();
  });

  it("reconoce las marcas de pago y las quita del concepto", () => {
    expect(marcaDePago("RESIDENCIA CUENTA AJENA INICIAL – Primer pago (1-2)")).toEqual({ orden: 1, de: 2 });
    expect(marcaDePago("Residencia cuenta ajena inicial – segundo pago (2-2)")).toEqual({ orden: 2, de: 2 });
    expect(marcaDePago("TRAMITES DE PAC DE DAMIAN A. GRAFF Y FAMILIARES (Factura 1 de 2)")).toEqual({ orden: 1, de: 2 });
    expect(marcaDePago("TRAMITE DE ALTAM, CUALIFICADOS SEGUNDO PAGO")).toEqual({ orden: 2, de: null });
    expect(marcaDePago("2º pago renovación")).toEqual({ orden: 2, de: null });
    expect(marcaDePago("CUENTA AJENA – BAKARY MANNEH")).toBeNull();
    expect(marcaDePago("REGULARIZACION 2 tramites (hijo Carlos)")).toBeNull();
    expect(sinMarcaDePago("RESIDENCIA CUENTA AJENA INICIAL – Primer pago (1-2)")).toBe("RESIDENCIA CUENTA AJENA INICIAL");
    expect(sinMarcaDePago("TRAMITES DE PAC DE DAMIAN A. GRAFF Y FAMILIARES (Factura 1 de 2)")).toBe("TRAMITES DE PAC DE DAMIAN A. GRAFF Y FAMILIARES");
  });

  it("junta las facturas de un mismo servicio, nunca dos servicios parecidos", () => {
    const f = (id: string, concepto: string | null, fecha: string, titular = "cindy", servicio = "cuenta_ajena"): FilaPago => ({ id, titular, servicio, concepto, fecha });
    const enlaces = detectarPagos([
      f("262", "RESIDENCIA CUENTA AJENA INICIAL – Primer pago (1-2)", "2026-09-10"),
      f("271", "Residencia cuenta ajena inicial – segundo pago (2-2)", "2026-09-25"),
      f("171", "CUENTA AJENA – BAKARY MANNEH", "2026-05-26", "yousupha"),
      f("172", "CUENTA AJENA – LAMINE MANNEH", "2026-05-26", "yousupha"),
      f("otro", "RESIDENCIA CUENTA AJENA INICIAL – Segundo pago (2-2)", "2026-09-25", "otra-persona"),
    ]);
    expect([...enlaces]).toEqual([["271", "262"]]);
    // La numeración vuelve a empezar: son dos servicios, cada uno con sus dos pagos.
    const dos = detectarPagos([
      f("a1", "RENOVACION (1-2)", "2025-01-10"), f("a2", "RENOVACION (2-2)", "2025-02-10"),
      f("b1", "RENOVACION (1-2)", "2026-01-10"), f("b2", "RENOVACION (2-2)", "2026-02-10"),
    ]);
    expect(Object.fromEntries(dos)).toEqual({ a2: "a1", b2: "b1" });
  });

  it("agrupa por pagoDeId y resume el cobro", () => {
    const g = agruparPagos([
      { id: "271", pagoDeId: "262", fecha: "2026-09-25" },
      { id: "262", pagoDeId: null, fecha: "2026-09-10" },
      { id: "huérfano", pagoDeId: "no-está", fecha: "2026-01-01" },
    ]);
    expect(g.map((x) => [x.principal.id, x.pagos.map((p) => p.id)])).toEqual([["262", ["262", "271"]], ["huérfano", ["huérfano"]]]);
    expect(cobroDePagos(["COBRADA", "PENDIENTE"])).toBe("PENDIENTE");
    expect(cobroDePagos(["COBRADA", "COBRADA"])).toBe("COBRADA");
    expect(cobroDePagos(["COBRADA", null])).toBeNull();
  });
});
