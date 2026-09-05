import { describe, it, expect } from "vitest";
import { construirChecklist, esperandoAlCliente, type DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 0, cuentas: 0, miembros: 1, plan: "PRO",
};
const t = (s: string) => s;
const hecho = (d: DatosActivacion, k: string) => construirChecklist(d, t).find((i) => i.key === k)!.done;

describe("checklist de activación", () => {
  it("la primera sesión va antes que el camino crítico, y este antes que la administración", () => {
    const claves = construirChecklist(base, t).map((i) => i.key);
    expect(claves.slice(0, 6)).toEqual(["ejemplo", "clientes", "documento_propio", "expediente", "enlace", "documento"]);
    expect(claves.indexOf("servicios")).toBeGreaterThan(claves.indexOf("documento"));
  });

  // 05/09/2026: el primer paso enseña lo que hace la IA sin depender de ningún cliente.
  it("el ejemplo se da por hecho cuando se generan sus formularios, y lleva a él si existe", () => {
    const sin = construirChecklist(base, t).find((i) => i.key === "ejemplo")!;
    expect(sin.done).toBe(false);
    expect(sin.href).toBe("/app/ejemplo"); // despacho anterior al ejemplo: se siembra al clic
    const con = construirChecklist({ ...base, ejemploId: "abc", ejemploFormulariosGenerados: true }, t).find((i) => i.key === "ejemplo")!;
    expect(con.done).toBe(true);
    expect(con.href).toBe("/app/expedientes/abc");
  });

  it("subir un documento propio cuenta en su paso, pero NO como subida del cliente", () => {
    const d = { ...base, documentosPropios: 1 };
    expect(hecho(d, "documento_propio")).toBe(true);
    expect(hecho(d, "documento")).toBe(false);
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
