import { describe, it, expect } from "vitest";
import { situacionExtranjeria, esEstadoExtranjeria } from "./extranjeria";

const base = { resuelta: null, requerimientos: [], estado: null, estadoAt: null } as Parameters<typeof situacionExtranjeria>[0];

describe("estado en Extranjería (lo que se enseña en la ficha y en la fila)", () => {
  it("sin nada registrado", () => {
    expect(situacionExtranjeria(base)).toEqual({ tipo: "sin_respuesta" });
  });
  it("«en trámite» con la fecha de la última consulta", () => {
    expect(situacionExtranjeria({ ...base, estado: "EN_TRAMITE", estadoAt: "2026-09-24T10:00:00Z" })).toEqual({ tipo: "en_tramite", consultadoEl: "2026-09-24T10:00:00Z" });
  });
  it("un requerimiento pendiente pasa por delante de «en trámite» (el plazo corre), el más cercano primero", () => {
    const s = situacionExtranjeria({ ...base, estado: "EN_TRAMITE", estadoAt: "2026-09-24T10:00:00Z", requerimientos: [
      { estado: "PENDIENTE", fechaLimite: "2026-10-20" }, { estado: "PENDIENTE", fechaLimite: "2026-10-08" }, { estado: "APORTADO", fechaLimite: "2026-10-01" },
    ] });
    expect(s).toEqual({ tipo: "requerimiento", fechaLimite: "2026-10-08" });
  });
  it("un requerimiento ya aportado no cuenta", () => {
    expect(situacionExtranjeria({ ...base, requerimientos: [{ estado: "APORTADO", fechaLimite: "2026-10-01" }] })).toEqual({ tipo: "sin_respuesta" });
  });
  it("la resolución manda sobre todo lo demás", () => {
    expect(situacionExtranjeria({ ...base, resuelta: "denegado", estado: "EN_TRAMITE", estadoAt: "2026-09-24T10:00:00Z", requerimientos: [{ estado: "PENDIENTE", fechaLimite: "2026-10-08" }] }))
      .toEqual({ tipo: "resuelta", salida: "denegado" });
  });
  it("solo se aceptan los estados conocidos", () => {
    expect(esEstadoExtranjeria("EN_TRAMITE")).toBe(true);
    expect(esEstadoExtranjeria("RESUELTO")).toBe(false);
    expect(esEstadoExtranjeria(null)).toBe(false);
  });
});
