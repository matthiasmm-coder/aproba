import { describe, expect, it } from "vitest";
import { LIMITE_SIMPLIFICADA, motivoNoSimplificada, prefijoSimplificada, tituloFactura } from "./facturas";
import { calcularSerie } from "./factura-numero";
import { construirAlta } from "./verifactu";

// Factura simplificada (RD 1619/2012, arts. 4 y 7) — petición de Juan, 29/09/2026.
describe("serie propia de las simplificadas", () => {
  it("prefijo S, y S-<oficina> cuando la sede tiene el suyo", () => {
    expect(prefijoSimplificada()).toBe("S");
    expect(prefijoSimplificada("  DG ")).toBe("S-DG");
  });
  it("corre aparte de la serie común, de la de la oficina y de las rectificativas", () => {
    // `emitidos()` filtra con like '<prefijo>-<año>-%': cada serie solo ve sus números.
    const todos = ["2026-0041", "DG-2026-0007", "R-2026-0002", "S-2026-0003", "S-DG-2026-0001", "S-073/2026"];
    const de = (prefijo: string) => todos.filter((n) => n.startsWith(`${prefijo}-2026-`));
    expect(calcularSerie(de("S"), 2026, 1, "S")).toEqual(["S-2026-0004"]);
    expect(calcularSerie(de("S-DG"), 2026, 1, "S-DG")).toEqual(["S-DG-2026-0002"]);
    expect(de("")).toEqual([]); // la serie común («2026-%») no atrapa ninguna S
    expect(todos.filter((n) => n.startsWith("2026-"))).toEqual(["2026-0041"]);
    // Un número escrito a mano con otro formato («S-073/2026») no entra en la serie.
    expect(de("S")).toEqual(["S-2026-0003"]);
  });
});

describe("qué puede ser simplificada", () => {
  it("hasta 400 € IVA incluido, ni un céntimo más", () => {
    expect(LIMITE_SIMPLIFICADA).toBe(400);
    expect(motivoNoSimplificada(400)).toBeNull();
    expect(motivoNoSimplificada(400.01)).toContain("400 €");
  });
  it("sin retención de IRPF (el pagador tendría que estar identificado)", () => {
    expect(motivoNoSimplificada(121, 15)).toContain("retención");
    expect(motivoNoSimplificada(121, null)).toBeNull();
    expect(motivoNoSimplificada(121, 0)).toBeNull();
  });
});

describe("título del documento", () => {
  it("lo dice la propia factura", () => {
    expect(tituloFactura({})).toBe("Factura");
    expect(tituloFactura({ simplificada: true })).toBe("Factura simplificada");
    expect(tituloFactura({ rectificaId: "x" })).toBe("Factura rectificativa");
    expect(tituloFactura({ rectificaNumero: "2026-0003" })).toBe("Factura rectificativa");
    expect(tituloFactura({ simplificada: true, rectificaId: "x" })).toBe("Factura rectificativa simplificada");
  });
});

describe("VERI*FACTU de una simplificada", () => {
  const HOY = new Date("2026-10-01T10:00:00+02:00");
  const f = { numero: "S-2026-0001", fechaEmision: "2026-10-01T08:00:00.000Z", concepto: "Asignación de NIE", base: 100, simplificada: true };

  it("F2 sin destinatario aunque la ficha tenga NIE, y sin la marca 6.1.d", () => {
    const r = construirAlta(f, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identificacion).toBe("simplificada");
    expect(r.payload.tipo_factura).toBe("F2");
    expect(r.payload.nif).toBeUndefined();
    expect(r.payload.id_otro).toBeUndefined();
    expect(r.payload.nombre).toBeUndefined();
    expect(r.payload.especial).toBeUndefined(); // esa marca es la de una COMPLETA sin destinatario
    expect(r.payload.importe_total).toBe("121.00");
  });

  it("más de 400 € IVA incluido → no se registra como simplificada", () => {
    const r = construirAlta({ ...f, base: 340 }, { nombre: "Amadou Diallo" }, { hoy: HOY, entorno: "test" }); // 411,40 €
    expect(r).toMatchObject({ ok: false, codigo: "IMPORTE" });
  });

  it("una factura completa sigue como antes (F1 con el NIE de la ficha)", () => {
    const r = construirAlta({ ...f, numero: "2026-0042", simplificada: false }, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "test" });
    expect(r.ok && r.payload.tipo_factura).toBe("F1");
  });

  it("su rectificativa es R5, sin destinatario", () => {
    const rect = { numero: "R-2026-0001", fechaEmision: "2026-10-01T08:00:00.000Z", concepto: "Rectificativa de la factura S-2026-0001", base: -100, simplificada: true,
      rectifica: { numero: "S-2026-0001", fechaExpedicion: "2026-10-01", simplificada: true } };
    const r = construirAlta(rect, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "test" });
    expect(r.ok && r.payload.tipo_factura).toBe("R5");
    expect(r.ok && r.payload.nif).toBeUndefined();
  });
});
