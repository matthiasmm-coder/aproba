import { describe, expect, it } from "vitest";
import { conTarifasPropias, presupuestoOpcionesValidas, tarifasPropiasValidas, VALIDEZ_PRESUPUESTO_DIAS } from "@/lib/tarifas-propias";
import { aplicarDescuento, serviciosDeExpediente, tarifaAsignada, tarifaDeServicios } from "@/lib/multi-servicio";
import type { Servicio } from "@/lib/servicios";

const svc = (id: string, anticipo: number, resto: number, extra: Partial<Servicio> = {}): Servicio =>
  ({ id, label: id, desc: "", docs: [], active: true, precio: anticipo + resto, anticipo, resto, ...extra });

describe("honorarios propios del expediente · lectura", () => {
  it("acepta importes válidos, redondea al céntimo y descarta lo que no se puede facturar", () => {
    expect(tarifasPropiasValidas({ arraigo_social: { anticipo: "150.005", resto: 200 } })).toEqual({ arraigo_social: { anticipo: 150.01, resto: 200 } });
    expect(tarifasPropiasValidas({ a: { anticipo: -1, resto: 0 }, b: { anticipo: "x", resto: 1 }, c: { anticipo: 1e9, resto: 0 } })).toBeNull();
    expect(tarifasPropiasValidas(null)).toBeNull();
    expect(tarifasPropiasValidas([{ anticipo: 1, resto: 1 }])).toBeNull();
    expect(tarifasPropiasValidas({})).toBeNull();
  });

  it("opciones del presupuesto: validez 1-365 días (si no, 30) y nota recortada", () => {
    expect(presupuestoOpcionesValidas({ validezDias: 15, nota: "  Precio para los dos cónyuges  " })).toEqual({ validezDias: 15, nota: "Precio para los dos cónyuges" });
    expect(presupuestoOpcionesValidas({ validezDias: 0 })).toEqual({ validezDias: VALIDEZ_PRESUPUESTO_DIAS, nota: "" });
    expect(presupuestoOpcionesValidas({ validezDias: 999, nota: "x".repeat(900) })!.nota).toHaveLength(600);
    expect(presupuestoOpcionesValidas("nada")).toBeNull();
  });
});

describe("honorarios propios del expediente · precio", () => {
  const catalogo = [svc("arraigo_social", 0, 0), svc("nie", 30, 20), svc("consulta", 0, 0, { precioOculto: true })];

  it("sustituyen la tarifa del catálogo solo en ESE servicio, y resuelven el «a consultar»", () => {
    const out = conTarifasPropias(catalogo, { arraigo_social: { anticipo: 200, resto: 150 }, consulta: { anticipo: 60, resto: 0 } });
    expect(out[0]).toMatchObject({ anticipo: 200, resto: 150, precio: 350, precioOculto: false });
    expect(out[1]).toBe(catalogo[1]); // el resto del catálogo, intacto
    expect(out[2]).toMatchObject({ anticipo: 60, resto: 0, precioOculto: false });
    expect(catalogo[0].anticipo).toBe(0); // no muta el catálogo
  });

  it("serviciosDeExpediente los aplica, y el descuento sigue yendo encima", () => {
    const exp = { tipo: "ARRAIGO_SOCIAL", servicioClave: "arraigo_social", serviciosExtra: ["nie"], tarifasPropias: { arraigo_social: { anticipo: 200, resto: 150 } } };
    const svs = serviciosDeExpediente(exp, catalogo);
    expect(tarifaDeServicios(svs)).toEqual({ anticipo: 230, resto: 170 });
    const reb = aplicarDescuento(tarifaAsignada(svs, null, 1), 1, { tipo: "PORCENTAJE", valor: 10 });
    expect(reb.anticipo + reb.resto).toBeCloseTo(360, 2);
  });

  it("sin precio propio, todo sigue como antes (catálogo)", () => {
    const svs = serviciosDeExpediente({ tipo: "NIE", servicioClave: "nie" }, catalogo);
    expect(svs[0]).toBe(catalogo[1]);
  });

  it("familia: el precio propio es por persona, como el del catálogo", () => {
    const svs = serviciosDeExpediente({ tipo: "ARRAIGO_SOCIAL", servicioClave: "arraigo_social", tarifasPropias: { arraigo_social: { anticipo: 100, resto: 50 } } }, catalogo);
    expect(tarifaAsignada(svs, null, 3)).toEqual({ anticipo: 300, resto: 150 });
  });
});
