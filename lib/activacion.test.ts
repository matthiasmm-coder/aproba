import { describe, it, expect } from "vitest";
import { construirChecklist, esperandoAlCliente, type DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 0, cuentas: 0, miembros: 1, plan: "PRO",
  creadoEn: "2026-09-06T09:00:00", // cuenta nacida con la guía y el ejemplo
};
const t = (s: string) => s;
const hecho = (d: DatosActivacion, k: string) => construirChecklist(d, t).find((i) => i.key === k)!.done;

describe("checklist de Inicio · solo configuración del despacho (06/09/2026)", () => {
  it("lista lo que conviene dejar listo, sin pasos de uso (esos los enseña la guía)", () => {
    const claves = construirChecklist(base, t).map((i) => i.key);
    expect(claves).toEqual(["servicios", "banco", "fiscal", "encargo", "avisos", "importar", "equipo"]);
    for (const k of ["ejemplo", "clientes", "documento_propio", "expediente", "enlace", "documento"]) expect(claves).not.toContain(k);
    expect(construirChecklist({ ...base, plan: "STARTER" }, t).map((i) => i.key)).not.toContain("equipo");
  });
  it("cada punto se da por hecho por un dato real", () => {
    expect(hecho(base, "servicios")).toBe(false);
    expect(hecho({ ...base, serviciosConPrecio: 2 }, "servicios")).toBe(true);
    expect(hecho({ ...base, servicios: 9 }, "servicios")).toBe(false); // servicios a 0 € no cuentan
    expect(hecho({ ...base, cuentas: 1 }, "banco")).toBe(true);
    expect(hecho({ ...base, datosFiscales: true }, "fiscal")).toBe(true);
    expect(hecho({ ...base, hojaEncargoActiva: true }, "encargo")).toBe(true);
    expect(hecho({ ...base, avisosPersonalizados: 1 }, "avisos")).toBe(true);
    expect(hecho({ ...base, clientes: 3 }, "importar")).toBe(true);
    expect(hecho({ ...base, miembros: 2 }, "equipo")).toBe(true);
  });
  it("todos los enlaces llevan a Ajustes o a Importar", () => {
    for (const i of construirChecklist({ ...base }, t)) expect(i.href.startsWith("/app/ajustes") || i.href === "/app/importar").toBe(true);
  });
});
