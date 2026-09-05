import { describe, it, expect } from "vitest";
import { pasoDeGuia } from "./guia";
import type { DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 5, cuentas: 0, miembros: 1, plan: "PRO",
  ejemploId: "ej1", ejemploFormulariosGenerados: false, documentosPropios: 0,
  creadoEn: "2026-09-06T09:00:00",
};

describe("guía interactiva · un paso a la vez", () => {
  it("solo acompaña a las cuentas nacidas con ella (05/09/2026): las anteriores no ven nada", () => {
    expect(pasoDeGuia({ ...base, creadoEn: "2026-07-29T10:00:00" }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-07-29T10:00:00", ejemploFormulariosGenerados: true }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T16:59:59" }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T17:29:00.123" }, "/app")?.key).toBe("ejemplo");
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T17:29:00.123Z" }, "/app")?.key).toBe("ejemplo");
    expect(pasoDeGuia({ ...base, creadoEn: null }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: undefined }, "/app")).toBeNull();
  });
  it("empieza por el ejemplo, y señala el elemento de la página en la que estás", () => {
    expect(pasoDeGuia(base, "/app")?.key).toBe("ejemplo");
    expect(pasoDeGuia(base, "/app")?.ir).toBe("/app/expedientes/ej1");
    expect(pasoDeGuia(base, "/app/expedientes/ej1")).toMatchObject({ key: "generar", anclaje: "generar" });
    expect(pasoDeGuia(base, "/app/expedientes/ej1/formularios")).toMatchObject({ key: "marcar", anclaje: "marcar" });
  });
  it("sin ejemplo sembrado, el primer paso lo siembra al clic", () => {
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app")?.ir).toBe("/app/ejemplo");
  });
  it("tras el ejemplo: cliente → su pasaporte → expediente → enlace → nada", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    expect(pasoDeGuia(hecho, "/app")?.key).toBe("cliente");
    expect(pasoDeGuia({ ...hecho, clientes: 1 }, "/app")?.key).toBe("subir-ir");
    expect(pasoDeGuia({ ...hecho, clientes: 1 }, "/app/clientes/abc")).toMatchObject({ key: "subir", anclaje: "subir" });
    expect(pasoDeGuia({ ...hecho, clientes: 1 }, "/app/clientes/nuevo")?.key).toBe("subir-ir");
    expect(pasoDeGuia({ ...hecho, clientes: 1, documentosPropios: 1 }, "/app")?.key).toBe("expediente");
    expect(pasoDeGuia({ ...hecho, clientes: 1, documentosPropios: 1, expedientes: 1 }, "/app")?.key).toBe("enlace");
    expect(pasoDeGuia({ ...hecho, clientes: 1, documentosPropios: 1, expedientes: 1, enlacesEnviados: 1 }, "/app")).toBeNull();
  });
  it("cada paso tiene título corto y texto de una línea", () => {
    for (const p of [pasoDeGuia(base, "/app"), pasoDeGuia({ ...base, ejemploFormulariosGenerados: true }, "/app")]) {
      expect(p!.titulo.split(" ").length).toBeLessThanOrEqual(6);
      expect(p!.texto.length).toBeLessThanOrEqual(70);
    }
  });
});
