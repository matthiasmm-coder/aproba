import { describe, expect, it } from "vitest";
import { PREFIJOS, separarTelefono, unirTelefono } from "./telefonos";

describe("separarTelefono", () => {
  it("detecta el prefijo y devuelve el resto", () => {
    expect(separarTelefono("+34 612345678")).toEqual({ dial: "+34", numero: "612345678" });
    expect(separarTelefono("+212 612-34-56-78")).toEqual({ dial: "+212", numero: "612345678" });
    expect(separarTelefono("+57 (300) 123 4567")).toEqual({ dial: "+57", numero: "3001234567" });
  });

  it("prefiere el prefijo MÁS LARGO (+593 no se lee como +59)", () => {
    expect(separarTelefono("+593987654321").dial).toBe("+593");
    expect(separarTelefono("+351912345678").dial).toBe("+351");
  });

  it("no inventa país cuando el número no lleva prefijo", () => {
    expect(separarTelefono("612345678")).toEqual({ dial: "", numero: "612345678" });
    expect(separarTelefono("")).toEqual({ dial: "", numero: "" });
    expect(separarTelefono(null)).toEqual({ dial: "", numero: "" });
  });

  it("deja intacto un + con prefijo desconocido", () => {
    expect(separarTelefono("+999 123")).toEqual({ dial: "", numero: "+999 123" });
  });
});

describe("unirTelefono", () => {
  it("une prefijo y número", () => {
    expect(unirTelefono("+34", "612345678")).toBe("+34 612345678");
  });

  it("sin número no guarda solo el prefijo", () => {
    expect(unirTelefono("+34", "")).toBe("");
    expect(unirTelefono("+34", "   ")).toBe("");
  });

  it("sin prefijo devuelve el número tal cual", () => {
    expect(unirTelefono("", "612345678")).toBe("612345678");
  });

  it("ida y vuelta estable", () => {
    const { dial, numero } = separarTelefono("+212 600112233");
    expect(unirTelefono(dial, numero)).toBe("+212 600112233");
  });
});

describe("catálogo de prefijos", () => {
  it("empieza por España y no tiene claves duplicadas", () => {
    expect(PREFIJOS[0].dial).toBe("+34");
    const claves = PREFIJOS.map((p) => `${p.code}${p.dial}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("todos los prefijos empiezan por + y son numéricos", () => {
    for (const p of PREFIJOS) expect(p.dial).toMatch(/^\+\d{1,4}$/);
  });
});
