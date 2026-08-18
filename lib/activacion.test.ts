import { describe, it, expect } from "vitest";
import { construirChecklist, esperandoAlCliente, type DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 0, cuentas: 0, miembros: 1, plan: "PRO",
};
const t = (s: string) => s;
const hecho = (d: DatosActivacion, k: string) => construirChecklist(d, t).find((i) => i.key === k)!.done;

describe("checklist de activación", () => {
  it("el camino crítico va ANTES que la administración", () => {
    const claves = construirChecklist(base, t).map((i) => i.key);
    expect(claves.slice(0, 4)).toEqual(["clientes", "expediente", "enlace", "documento"]);
    expect(claves.indexOf("servicios")).toBeGreaterThan(claves.indexOf("documento"));
  });

  // El fallo medido en Gesnet: 7 expedientes en PRESENTADO daban «enlace enviado»
  // por hecho sin que ningún cliente hubiera entrado jamás en el portal.
  it("un expediente avanzado por el gestor NO cuenta como enlace enviado", () => {
    const d = { ...base, clientes: 187, expedientes: 7, enlacesEnviados: 0 };
    expect(hecho(d, "enlace")).toBe(false);
    expect(hecho(d, "documento")).toBe(false);
  });

  it("el enlace solo se da por hecho si consta en el diario", () => {
    expect(hecho({ ...base, enlacesEnviados: 1 }, "enlace")).toBe(true);
  });

  it("el umbral es la subida DEL CLIENTE, no la del despacho", () => {
    expect(hecho({ ...base, subidasDeCliente: 1 }, "documento")).toBe(true);
    expect(hecho({ ...base, subidasDeCliente: 0 }, "documento")).toBe(false);
  });

  it("STARTER no ve el paso de equipo", () => {
    expect(construirChecklist({ ...base, plan: "STARTER" }, t).some((i) => i.key === "equipo")).toBe(false);
    expect(construirChecklist({ ...base, plan: "BUSINESS" }, t).some((i) => i.key === "equipo")).toBe(true);
  });

  it("detecta el caso Joshua: enlace fuera, cliente en silencio", () => {
    expect(esperandoAlCliente({ ...base, enlacesEnviados: 4, subidasDeCliente: 0 })).toBe(true);
    expect(esperandoAlCliente({ ...base, enlacesEnviados: 99, subidasDeCliente: 90 })).toBe(false);
    expect(esperandoAlCliente(base)).toBe(false); // sin enlace no se espera nada
  });
});
