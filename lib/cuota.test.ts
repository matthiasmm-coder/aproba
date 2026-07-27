import { describe, expect, it } from "vitest";
import { diaAnclaCiclo, inicioPeriodoCuota, periodoCuota } from "./cuota";

const utc = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe("día ancla del ciclo de facturación", () => {
  it("prioriza el periodo facturado por Stripe", () => {
    expect(diaAnclaCiclo({ currentPeriodEnd: "2026-08-17T10:00:00.000Z", trialEndsAt: "2026-07-03T00:00:00.000Z" })).toBe(17);
  });
  it("sin periodo facturado, usa el fin de la prueba (día del 1er cobro)", () => {
    expect(diaAnclaCiclo({ trialEndsAt: "2026-07-29T08:15:30.000Z" })).toBe(29);
  });
  it("sin datos, día 1 = mes natural (comportamiento anterior)", () => {
    expect(diaAnclaCiclo(null)).toBe(1);
    expect(diaAnclaCiclo({ currentPeriodEnd: "no-es-fecha" })).toBe(1);
  });
});

describe("ventana de cuota anclada al día de pago", () => {
  it("ya pasado el ancla este mes → el ciclo empezó este mes", () => {
    expect(periodoCuota(utc("2026-07-20"), { currentPeriodEnd: "2026-08-17T00:00:00.000Z" }).clave).toBe("2026-07-17");
  });

  it("antes del ancla → el ciclo vigente empezó el mes pasado", () => {
    expect(periodoCuota(utc("2026-07-05"), { currentPeriodEnd: "2026-07-17T00:00:00.000Z" }).clave).toBe("2026-06-17");
  });

  it("el mismo día del ancla ya cuenta como ciclo nuevo (reset)", () => {
    const { clave } = periodoCuota(utc("2026-07-17"), { currentPeriodEnd: "2026-08-17T00:00:00.000Z" });
    expect(clave).toBe("2026-07-17");
  });

  it("ancla el 31: en febrero cae el 28 (y el 29 en bisiesto), sin saltarse el ciclo", () => {
    expect(periodoCuota(utc("2026-02-28"), { currentPeriodEnd: "2026-03-31T00:00:00.000Z" }).clave).toBe("2026-02-28");
    expect(periodoCuota(utc("2028-02-29"), { currentPeriodEnd: "2028-03-31T00:00:00.000Z" }).clave).toBe("2028-02-29");
  });

  it("ancla el 31 en un mes de 30 días → día 30", () => {
    expect(periodoCuota(utc("2026-04-30"), { currentPeriodEnd: "2026-05-31T00:00:00.000Z" }).clave).toBe("2026-04-30");
  });

  it("día 1 reproduce exactamente el mes natural", () => {
    expect(periodoCuota(utc("2026-07-01"), null).clave).toBe("2026-07-01");
    expect(periodoCuota(utc("2026-07-31"), null).clave).toBe("2026-07-01");
  });

  it("cruce de año hacia atrás", () => {
    expect(periodoCuota(utc("2026-01-05"), { currentPeriodEnd: "2026-01-20T00:00:00.000Z" }).clave).toBe("2025-12-20");
  });

  it("el fin del ciclo es el inicio del siguiente (ventana continua, sin huecos)", () => {
    const p = periodoCuota(utc("2026-07-20"), { currentPeriodEnd: "2026-08-17T00:00:00.000Z" });
    expect(p.fin.toISOString().slice(0, 10)).toBe("2026-08-17");
    // El día siguiente al fin pertenece YA al ciclo que empieza en `fin`.
    expect(periodoCuota(new Date(p.fin.getTime() + 3600e3), { currentPeriodEnd: "2026-09-17T00:00:00.000Z" }).clave).toBe("2026-08-17");
  });

  it("inicioPeriodoCuota es idempotente dentro del mismo ciclo", () => {
    const a = inicioPeriodoCuota(utc("2026-07-18"), 17);
    const b = inicioPeriodoCuota(utc("2026-08-16"), 17);
    expect(a.toISOString().slice(0, 10)).toBe("2026-07-17");
    expect(b.toISOString().slice(0, 10)).toBe("2026-07-17"); // mismo ciclo → misma clave
  });
});
