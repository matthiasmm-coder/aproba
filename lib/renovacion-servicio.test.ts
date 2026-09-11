import { describe, it, expect } from "vitest";
import { sugerirServicioRenovacion, serviciosElegibles } from "./renovacion-servicio";

// Vigía (11/09/2026): «Iniciar renovación» clavaba «renovacion_tie» para cualquier
// vencimiento y, sin ese servicio, creaba una renovación sin trámite ni precio.
const cat = (over: Partial<{ id: string; label: string; active: boolean }>[]) =>
  over.map((o, i) => ({ id: o.id ?? `srv_${i}`, label: o.label ?? "", active: o.active ?? true }));

describe("sugerirServicioRenovacion", () => {
  it("TIE → Renovación de TIE si está activa", () => {
    expect(sugerirServicioRenovacion("TIE", cat([{ id: "renovacion_tie" }, { id: "nie" }]))).toBe("renovacion_tie");
  });
  it("TIE sin renovacion_tie → larga duración como segunda opción", () => {
    expect(sugerirServicioRenovacion("TIE", cat([{ id: "renovacion_tie", active: false }, { id: "larga_duracion" }]))).toBe("larga_duracion");
  });
  it("un PASAPORTE nunca cae en Renovación de TIE", () => {
    expect(sugerirServicioRenovacion("PASAPORTE", cat([{ id: "renovacion_tie" }, { id: "arraigo_social" }]))).toBeNull();
  });
  it("PASAPORTE → servicio propio del gestor que lo nombra", () => {
    expect(sugerirServicioRenovacion("PASAPORTE", cat([{ id: "renovacion_tie" }, { id: "srv_ab12", label: "Renovación de pasaporte" }]))).toBe("srv_ab12");
  });
  it("NIE → servicio nie", () => {
    expect(sugerirServicioRenovacion("NIE", cat([{ id: "nie" }]))).toBe("nie");
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
