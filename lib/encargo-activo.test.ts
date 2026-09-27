import { describe, expect, it } from "vitest";
import { activoDeBloque, algunoActivo, docsFirma, firmaTexto, DOC_HOJA_FIRMADA, DOC_MANDATO_FIRMADO } from "@/lib/encargo-activo";

describe("hoja de encargo y mandato · un interruptor para cada uno", () => {
  it("sin mandatoActivo (antes de la migración o sede que no lo tocó), el mandato sigue a la hoja", () => {
    expect(activoDeBloque({ hojaEncargoActiva: true })).toEqual({ hoja: true, mandato: true });
    expect(activoDeBloque({ hojaEncargoActiva: false, mandatoActivo: null })).toEqual({ hoja: false, mandato: false });
    expect(activoDeBloque(null)).toEqual({ hoja: false, mandato: false });
  });
  it("con mandatoActivo, cada uno el suyo", () => {
    expect(activoDeBloque({ hojaEncargoActiva: true, mandatoActivo: false })).toEqual({ hoja: true, mandato: false });
    expect(activoDeBloque({ hojaEncargoActiva: false, mandatoActivo: true })).toEqual({ hoja: false, mandato: true });
  });
  it("las casillas firmadas que se piden al cliente", () => {
    expect(docsFirma({ hoja: true, mandato: true })).toEqual([DOC_HOJA_FIRMADA, DOC_MANDATO_FIRMADO]);
    expect(docsFirma({ hoja: false, mandato: true })).toEqual([DOC_MANDATO_FIRMADO]);
    expect(docsFirma({ hoja: false, mandato: false })).toEqual([]);
    expect(algunoActivo({ hoja: false, mandato: true })).toBe(true);
  });
  it("los emails dicen lo que va, con su concordancia", () => {
    expect(firmaTexto({ hoja: true, mandato: true })?.lo).toBe("los");
    expect(firmaTexto({ hoja: true, mandato: false })).toMatchObject({ que: "la hoja de encargo", lo: "la", enviado: "hoja de encargo enviada" });
    expect(firmaTexto({ hoja: false, mandato: true })).toMatchObject({ que: "el mandato de representación", lo: "lo", adjunto: "mandato adjunto" });
    expect(firmaTexto({ hoja: false, mandato: false })).toBeNull();
  });
});
