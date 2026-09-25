import { describe, it, expect } from "vitest";
import {
  calcularEstadisticas, resumir, enPeriodo, periodoDeParams, nombrePeriodo, slugPeriodo, variacion,
  eurCorto, pct, escalaEje, ultimoMesConDatos,
  type MovEmitida, type MovRecibida,
} from "./estadisticas-facturacion";

const emi = (o: Partial<MovEmitida> = {}): MovEmitida => ({ fecha: "2026-02-10", base: 100, iva: 21, total: 121, cobrado: 121, cliente: "Ana", fuente: "APROBA", ...o });
const rec = (o: Partial<MovRecibida> = {}): MovRecibida => ({ fecha: "2026-02-15", base: 200, iva: 42, retencion: 0, total: 242, pagada: true, proveedor: "Alquiler", ...o });

describe("estadísticas de facturación · resumen", () => {
  it("suma ingresos y gastos con su IVA, retenciones, cobros y pagos", () => {
    const r = resumir(
      [emi(), emi({ base: 50, iva: 10.5, total: 80.5, cobrado: 0 })], // la 2.ª lleva 20 € de suplidos
      [rec({ retencion: 30, total: 212 }), rec({ base: 10, iva: 2.1, total: 12.1, pagada: false })],
    );
    expect(r.ingresos).toMatchObject({ base: 150, iva: 31.5, total: 201.5, n: 2, cobrado: 121, pendiente: 80.5, sinDesglose: 0, cobroDesconocido: 0 });
    expect(r.gastos).toMatchObject({ base: 210, iva: 44.1, retenciones: 30, total: 224.1, n: 2, pagado: 212, pendiente: 12.1 });
    expect(r.resultado).toBe(-60);
    expect(r.margen).toBe(-0.4);
    expect(r.ivaNeto).toBe(-12.6); // más IVA soportado que repercutido → a compensar
  });

  it("una rectificativa (importes negativos) neutraliza a su original", () => {
    const r = resumir([emi({ cobrado: 0 }), emi({ base: -100, iva: -21, total: -121, cobrado: 0 })], []);
    expect(r.ingresos).toMatchObject({ base: 0, iva: 0, total: 0, pendiente: 0 });
  });

  it("una importada sin desglose cuenta en el total, nunca en la base ni en el IVA", () => {
    const r = resumir([emi(), emi({ base: null, iva: null, total: 484, fuente: "ANTERIOR" })], []);
    expect(r.ingresos).toMatchObject({ base: 100, iva: 21, total: 605, sinDesglose: 1, sinDesgloseTotal: 484 });
    expect(r.resultado).toBe(100);
  });

  it("sin estado de cobro: ni cobrado ni pendiente, se declara aparte", () => {
    const r = resumir([emi({ cobrado: null, fuente: "ANTERIOR" })], []);
    expect(r.ingresos).toMatchObject({ cobrado: 0, pendiente: 0, cobroDesconocido: 121 });
  });

  it("suma en céntimos: diez facturas de 0,10 € son 1 € exacto", () => {
    const r = resumir(Array.from({ length: 10 }, () => emi({ base: 0.1, iva: 0.02, total: 0.12, cobrado: 0.12 })), []);
    expect(r.ingresos.base).toBe(1);
    expect(r.ingresos.total).toBe(1.2);
  });

  it("margen null sin ingresos", () => {
    expect(resumir([], [rec()]).margen).toBeNull();
  });
});

describe("estadísticas de facturación · periodos", () => {
  it("año completo y trimestre", () => {
    expect(enPeriodo("2026-04-01", { anio: 2026, trimestre: 2 })).toBe(true);
    expect(enPeriodo("2026-03-31", { anio: 2026, trimestre: 2 })).toBe(false);
    expect(enPeriodo("2026-12-31", { anio: 2026, trimestre: 0 })).toBe(true);
    expect(enPeriodo("2025-12-31", { anio: 2026, trimestre: 0 })).toBe(false);
    expect(enPeriodo("", { anio: 2026, trimestre: 0 })).toBe(false);
  });

  it("filtra el periodo, compara con el mismo del año anterior y reparte por meses y trimestres", () => {
    const e = calcularEstadisticas(
      [emi({ fecha: "2026-01-05" }), emi({ fecha: "2026-05-20", base: 300, iva: 63, total: 363 }), emi({ fecha: "2025-02-01", base: 80, iva: 16.8, total: 96.8 }), emi({ fecha: "2026-06-01", base: null, iva: null, total: 50, fuente: "ANTERIOR" })],
      [rec({ fecha: "2026-05-02" }), rec({ fecha: "sin fecha" })],
      { anio: 2026, trimestre: 1 },
    );
    expect(e.resumen.ingresos.base).toBe(100);
    expect(e.resumen.gastos.n).toBe(0);
    expect(e.anterior?.ingresos.base).toBe(80);
    expect(e.meses).toHaveLength(12);
    expect(e.meses[4]).toMatchObject({ mes: 5, ingresos: 300, gastos: 200, resultado: 100, ivaRepercutido: 63, ivaSoportado: 42, nEmitidas: 1, nRecibidas: 1 });
    expect(e.meses[5]).toMatchObject({ ingresos: 0, ingresosSinDesglose: 50 });
    expect(e.trimestres.map((t) => t.ingresos.base)).toEqual([100, 300, 0, 0]);
    expect(e.trimestres[1].ivaNeto).toBe(21);
    expect(e.fuentes).toEqual({ aproba: 1, anteriores: 0, recibidas: 0 });
    expect(e.anios).toEqual([2026, 2025]);
  });

  it("año en curso: la comparación se corta en la misma fecha del año anterior", () => {
    const em = [emi({ fecha: "2026-03-10" }), emi({ fecha: "2025-03-01" }), emi({ fecha: "2025-11-20", base: 900, iva: 189, total: 1089 })];
    const hoy = calcularEstadisticas(em, [], { anio: 2026, trimestre: 0 }, { hoy: "2026-09-25" });
    expect(hoy.anterior?.ingresos.base).toBe(100); // noviembre de 2025 aún no tiene par
    const cerrado = calcularEstadisticas(em, [], { anio: 2026, trimestre: 0 }, { hoy: "2027-01-15" });
    expect(cerrado.anterior?.ingresos.base).toBe(1000); // año terminado: completo contra completo
  });

  it("sin datos del año anterior, no hay comparación", () => {
    expect(calcularEstadisticas([emi()], [], { anio: 2026, trimestre: 0 }).anterior).toBeNull();
  });

  it("el año elegido siempre está en el selector aunque no tenga datos", () => {
    expect(calcularEstadisticas([emi({ fecha: "2025-01-01" })], [], { anio: 2026, trimestre: 0 }).anios).toEqual([2026, 2025]);
  });
});

describe("estadísticas de facturación · rankings", () => {
  it("agrupa el mismo cliente escrito distinto y calcula su cuota", () => {
    const e = calcularEstadisticas(
      [emi({ cliente: "Hervás Abogados", total: 300 }), emi({ cliente: "HERVAS  ABOGADOS", total: 100 }), emi({ cliente: "Otro", total: 100 })],
      [rec({ proveedor: "" })],
      { anio: 2026, trimestre: 0 },
    );
    expect(e.topClientes[0]).toMatchObject({ nombre: "Hervás Abogados", total: 400, n: 2, cuota: 0.8 });
    expect(e.topProveedores[0].nombre).toBe("Sin nombre");
  });

  it("corta en el top pedido", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => emi({ cliente: `C${i}`, total: 100 + i }));
    const e = calcularEstadisticas(muchos, [], { anio: 2026, trimestre: 0 }, { top: 5 });
    expect(e.topClientes).toHaveLength(5);
    expect(e.topClientes[0].nombre).toBe("C11");
  });
});

describe("estadísticas de facturación · utilidades", () => {
  it("periodo desde la URL, con valores por defecto sensatos", () => {
    expect(periodoDeParams("2025", "3", 2026)).toEqual({ anio: 2025, trimestre: 3 });
    expect(periodoDeParams("abc", "9", 2026)).toEqual({ anio: 2026, trimestre: 0 });
    expect(periodoDeParams("1999", null, 2026)).toEqual({ anio: 2026, trimestre: 0 });
  });

  it("nombres del periodo", () => {
    expect(nombrePeriodo({ anio: 2026, trimestre: 0 })).toBe("Año 2026");
    expect(nombrePeriodo({ anio: 2026, trimestre: 2 })).toBe("2.º trimestre 2026 (abr-jun)");
    expect(slugPeriodo({ anio: 2026, trimestre: 3 })).toBe("2026-T3");
  });

  it("variación frente al año anterior", () => {
    expect(variacion(120, 100)).toBe(0.2);
    expect(variacion(80, 100)).toBe(-0.2);
    expect(variacion(50, 0)).toBeNull();
    expect(variacion(50, null)).toBeNull();
  });
});

describe("estadísticas de facturación · formatos y ejes", () => {
  it("importes cortos y porcentajes", () => {
    expect(eurCorto(14739.56)).toBe("15 k€");
    expect(eurCorto(2722.5)).toBe("2,7 k€");
    expect(eurCorto(-800.4)).toBe("-800 €");
    expect(pct(0.342)).toBe("34,2 %");
  });

  it("escala con pasos redondos que cubre el rango", () => {
    expect(escalaEje(0, 14739)).toEqual({ desde: 0, hasta: 15000, ticks: [0, 5000, 10000, 15000] });
    const e = escalaEje(-1200, 9000);
    expect(e.desde).toBeLessThanOrEqual(-1200);
    expect(e.hasta).toBeGreaterThanOrEqual(9000);
    expect(e.ticks).toContain(0);
    expect(escalaEje(0, 0).ticks.length).toBeGreaterThan(1);
  });

  it("último mes con datos", () => {
    const e = calcularEstadisticas([emi({ fecha: "2026-09-01" })], [rec({ fecha: "2026-03-01" })], { anio: 2026, trimestre: 0 });
    expect(ultimoMesConDatos(e.meses)).toBe(9);
  });
});
