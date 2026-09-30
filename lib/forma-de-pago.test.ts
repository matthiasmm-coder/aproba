import { describe, it, expect } from "vitest";
import { formaDePago } from "./forma-de-pago";
import { cuentaParaOficina } from "./facturacion-oficina";

// 30/09/2026 — el pie «Forma de pago» decía «transferencia» en duro (Luis lo marcó en amarillo).
// Matthias: el IBAN real si lo hay; si no, nada; «tarjeta» si se cobró con tarjeta.
const IBAN = "ES9121000418450200051332";

describe("pie «Forma de pago» de la factura", () => {
  const f = (estado: string, metodoPago: string | null = null, extra: Record<string, unknown> = {}) =>
    ({ estado, metodoPago, rectificaId: null, rectificaNumero: null, ...extra }) as Parameters<typeof formaDePago>[0];

  it("pendiente de cobro: transferencia con el IBAN real, agrupado de 4 en 4", () => {
    expect(formaDePago(f("EMITIDA", "TRANSFERENCIA"), 121, IBAN)).toEqual({ metodo: "Transferencia", iban: "ES91 2100 0418 4502 0005 1332" });
    expect(formaDePago(f("VENCIDA"), 121, " es91 2100 0418 4502 0005 1332 ")).toEqual({ metodo: "Transferencia", iban: "ES91 2100 0418 4502 0005 1332" });
  });

  it("sin IBAN no dice nada (antes: «transferencia» sin cuenta)", () => {
    expect(formaDePago(f("EMITIDA", "TRANSFERENCIA"), 121, null)).toBeNull();
    expect(formaDePago(f("EMITIDA"), 121, "")).toBeNull();
  });

  it("cobrada: el método REAL, aunque haya IBAN", () => {
    expect(formaDePago(f("PAGADA", "TARJETA"), 121, IBAN)).toEqual({ metodo: "Tarjeta", iban: null });
    expect(formaDePago(f("PAGADA", "EFECTIVO"), 121, IBAN)).toEqual({ metodo: "Efectivo", iban: null });
    expect(formaDePago(f("PAGADA", "OTRO"), 121, IBAN)).toBeNull();
    expect(formaDePago(f("PAGADA", "TRANSFERENCIA"), 121, IBAN)).toEqual({ metodo: "Transferencia", iban: "ES91 2100 0418 4502 0005 1332" });
    expect(formaDePago(f("PAGADA", "TRANSFERENCIA"), 121, null)).toEqual({ metodo: "Transferencia", iban: null });
  });

  it("«TARJETA» en una factura NO cobrada no es un hecho: manda el IBAN", () => {
    expect(formaDePago(f("EMITIDA", "TARJETA"), 121, IBAN)).toEqual({ metodo: "Transferencia", iban: "ES91 2100 0418 4502 0005 1332" });
  });

  it("nada en una anulada, una rectificativa o sin importe que pagar", () => {
    expect(formaDePago(f("ANULADA", "TRANSFERENCIA"), 121, IBAN)).toBeNull();
    expect(formaDePago(f("EMITIDA", null, { rectificaId: "f1" }), -121, IBAN)).toBeNull();
    expect(formaDePago(f("EMITIDA", null, { rectificaNumero: "2026-0003" }), 50, IBAN)).toBeNull();
    expect(formaDePago(f("EMITIDA"), 0, IBAN)).toBeNull();
  });
});

// Cliente falso en memoria: from(t).select().eq()/.is()… y limit()/maybeSingle().
function cliFalso(tablas: Record<string, Record<string, unknown>[]>) {
  return {
    from(t: string) {
      let filas = [...(tablas[t] ?? [])];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filas = filas.filter((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { filas = filas.filter((r) => (r[k] ?? null) === v); return q; },
        limit: async (n: number) => ({ data: filas.slice(0, n), error: null }),
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
      };
      return q;
    },
  } as never;
}

describe("cuenta de cobro de una sede", () => {
  const COMUN = { workspaceId: "ws", oficinaId: null, activa: true, titular: "Despacho SL", iban: "ES11", banco: "A" };
  const PROPIA = { workspaceId: "ws", oficinaId: "o1", activa: true, titular: "Laura Pérez", iban: "ES22", banco: "B" };
  const SEDE_CON_NIF = { id: "o1", razonSocial: "Laura Pérez Gil", nif: "12345678Z" };
  const SEDE_SIN_NIF = { id: "o1", razonSocial: null, nif: null };

  it("la sede con cuenta propia cobra en la suya", async () => {
    expect((await cuentaParaOficina(cliFalso({ CuentaBancaria: [COMUN, PROPIA], Oficina: [SEDE_CON_NIF] }), "ws", "o1"))?.iban).toBe("ES22");
  });

  it("una sede con identidad fiscal propia y SIN cuenta no hereda la del despacho (otro titular)", async () => {
    expect(await cuentaParaOficina(cliFalso({ CuentaBancaria: [COMUN], Oficina: [SEDE_CON_NIF] }), "ws", "o1")).toBeNull();
  });

  it("una sede que factura con los datos del despacho usa la cuenta común; sin sede, también", async () => {
    expect((await cuentaParaOficina(cliFalso({ CuentaBancaria: [COMUN], Oficina: [SEDE_SIN_NIF] }), "ws", "o1"))?.iban).toBe("ES11");
    expect((await cuentaParaOficina(cliFalso({ CuentaBancaria: [COMUN, PROPIA] }), "ws", null))?.iban).toBe("ES11");
  });
});
