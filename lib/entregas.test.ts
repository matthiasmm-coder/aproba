import { describe, it, expect } from "vitest";
import { metodoFactura, totalEntregado, saldoPendiente, estaCubierta, admiteEntregas, r2 } from "./entregas";

// El caso real: una factura de 363 € que el cliente paga 50 + 100 + 213.
describe("entregas a cuenta", () => {
  const e = (...importes: number[]) => importes.map((importe) => ({ importe }));

  it("suma las entregas", () => {
    expect(totalEntregado(e(50, 100))).toBe(150);
    expect(totalEntregado([])).toBe(0);
  });

  it("el saldo baja con cada entrega", () => {
    expect(saldoPendiente(363, e())).toBe(363);
    expect(saldoPendiente(363, e(50))).toBe(313);
    expect(saldoPendiente(363, e(50, 100))).toBe(213);
    expect(saldoPendiente(363, e(50, 100, 213))).toBe(0);
  });

  it("un exceso deja el saldo en 0, nunca en negativo", () => {
    expect(saldoPendiente(100, e(150))).toBe(0);
    expect(estaCubierta(100, e(150))).toBe(true);
  });

  it("aguanta los céntimos sin falsos pendientes", () => {
    expect(saldoPendiente(100, e(33.33, 33.33, 33.34))).toBe(0);
    expect(estaCubierta(100, e(33.33, 33.33, 33.34))).toBe(true);
    expect(estaCubierta(100, e(33.33, 33.33, 33.33))).toBe(false); // falta 1 céntimo de verdad
  });

  it("solo se cubre cuando se llega al total", () => {
    expect(estaCubierta(363, e(50, 100))).toBe(false);
    expect(estaCubierta(363, e(363))).toBe(true);
  });

  it("solo admite entregas donde hay deuda viva", () => {
    expect(admiteEntregas("EMITIDA")).toBe(true);
    expect(admiteEntregas("VENCIDA")).toBe(true);
    expect(admiteEntregas("PAGADA")).toBe(false);
    expect(admiteEntregas("ANULADA")).toBe(false);
    expect(admiteEntregas("BORRADOR")).toBe(false);
  });

  it("redondea a 2 decimales (dinero, no flotantes)", () => {
    expect(r2(0.1 + 0.2)).toBe(0.3);
    expect(totalEntregado(e(0.1, 0.2))).toBe(0.3);
  });
});

describe("metodoFactura — método real al saldar (fix 01/09/2026)", () => {
  it("mapea cada método de entrega al metodoPago de la factura", () => {
    expect(metodoFactura("efectivo")).toBe("EFECTIVO");
    expect(metodoFactura("tarjeta")).toBe("TARJETA");
    expect(metodoFactura("transferencia")).toBe("TRANSFERENCIA");
    expect(metodoFactura("otro")).toBe("OTRO");
  });
  it("desconocido o ausente → TRANSFERENCIA (comportamiento histórico)", () => {
    expect(metodoFactura("bizum")).toBe("TRANSFERENCIA");
    expect(metodoFactura(null)).toBe("TRANSFERENCIA");
    expect(metodoFactura(undefined)).toBe("TRANSFERENCIA");
  });
});
