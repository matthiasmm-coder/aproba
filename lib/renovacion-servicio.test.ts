import { describe, it, expect } from "vitest";
import { sugerirServicioRenovacion, serviciosElegibles, esDocumentoPropio, importesParaCliente, NOMBRE_SERVICIO_NUEVO } from "./renovacion-servicio";

// Vigía (11/09/2026): «Iniciar renovación» clavaba «renovacion_tie» para cualquier
// vencimiento y, sin ese servicio, creaba una renovación sin trámite ni precio.
const cat = (over: Partial<{ id: string; label: string; active: boolean }>[]) =>
  over.map((o, i) => ({ id: o.id ?? `srv_${i}`, label: o.label ?? "", active: o.active ?? true }));

describe("sugerirServicioRenovacion", () => {
  it("TIE → Renovación de TIE si está activa, con certeza (sale sola)", () => {
    expect(sugerirServicioRenovacion("TIE", cat([{ id: "renovacion_tie" }, { id: "nie" }]))).toEqual({ id: "renovacion_tie", certeza: "seguro" });
  });
  it("TIE sin renovacion_tie → larga duración como segunda opción", () => {
    expect(sugerirServicioRenovacion("TIE", cat([{ id: "renovacion_tie", active: false }, { id: "larga_duracion" }]))).toEqual({ id: "larga_duracion", certeza: "seguro" });
  });
  it("un PASAPORTE nunca cae en Renovación de TIE", () => {
    expect(sugerirServicioRenovacion("PASAPORTE", cat([{ id: "renovacion_tie" }, { id: "arraigo_social" }]))).toBeNull();
  });
  it("PASAPORTE → servicio propio que lo nombra, pero solo «probable» (el gestor valida)", () => {
    expect(sugerirServicioRenovacion("PASAPORTE", cat([{ id: "renovacion_tie" }, { id: "srv_ab12", label: "Renovación de pasaporte" }]))).toEqual({ id: "srv_ab12", certeza: "probable" });
  });
  it("NIE → servicio nie", () => {
    expect(sugerirServicioRenovacion("NIE", cat([{ id: "nie" }]))).toEqual({ id: "nie", certeza: "seguro" });
  });
  it("servicio desactivado no cuenta; catálogo vacío → null (el gestor elige)", () => {
    expect(sugerirServicioRenovacion("TIE", cat([{ id: "renovacion_tie", active: false }]))).toBeNull();
    expect(sugerirServicioRenovacion("TIE", [])).toBeNull();
  });
  it("tipo desconocido → null, sin excepción", () => {
    expect(sugerirServicioRenovacion("VISADO", cat([{ id: "renovacion_tie" }]))).toBeNull();
    expect(sugerirServicioRenovacion(null, cat([{ id: "renovacion_tie" }]))).toBeNull();
  });
  it("serviciosElegibles = solo activos", () => {
    expect(serviciosElegibles(cat([{ id: "a" }, { id: "b", active: false }])).map((s) => s.id)).toEqual(["a"]);
  });
});

// Todo vencimiento se propone como trámite; «pedir solo el documento» es secundario y solo
// tiene sentido para lo que el cliente puede renovar por su cuenta.
describe("esDocumentoPropio", () => {
  it("pasaporte y certificado de NIE: el cliente puede renovarlos solo", () => {
    expect(esDocumentoPropio("PASAPORTE")).toBe(true);
    expect(esDocumentoPropio("nie")).toBe(true);
  });
  it("el TIE nunca: solo se obtiene con el trámite", () => {
    expect(esDocumentoPropio("TIE")).toBe(false);
    expect(esDocumentoPropio("RENOVACION")).toBe(false);
    expect(esDocumentoPropio(null)).toBe(false);
  });
  it("hay un nombre por defecto para crear el servicio que falta", () => {
    expect(NOMBRE_SERVICIO_NUEVO.PASAPORTE).toBe("Renovación de pasaporte");
    expect(NOMBRE_SERVICIO_NUEVO.TIE).toBe("Renovación de TIE");
  });
});

describe("importesParaCliente (lo que lee el cliente en la propuesta)", () => {
  it("honorarios con IVA por cada pago + tasas sin IVA, anticipo solo si hay resto", () => {
    expect(importesParaCliente({ anticipo: 80, resto: 100 })).toEqual({ total: 217.8, anticipo: 96.8 });
    expect(importesParaCliente({ anticipo: 80, resto: 100, suplidos: [{ importe: 16.08 }] })).toEqual({ total: 233.88, anticipo: 112.88 });
  });
  it("pago único (sin resto) → sin línea de anticipo", () => {
    expect(importesParaCliente({ anticipo: 150, resto: 0 })).toEqual({ total: 181.5, anticipo: null });
  });
  it("precio a consultar o 0 € → sin importes (nunca «0,00 €» en un email)", () => {
    expect(importesParaCliente({ anticipo: 80, resto: 100, precioOculto: true })).toEqual({ total: null, anticipo: null });
    expect(importesParaCliente({ anticipo: 0, resto: 0 })).toEqual({ total: null, anticipo: null });
  });
});
