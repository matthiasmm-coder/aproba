import { describe, it, expect } from "vitest";
import { pasoDeGuia, PASOS_EJEMPLO, PASOS_REAL } from "./guia";
import type { DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 5, cuentas: 0, miembros: 1, plan: "PRO",
  ejemploId: "ej1", ejemploFormulariosGenerados: false, documentosPropios: 0,
  creadoEn: "2026-09-06T09:00:00",
};
const FICHA = "/app/expedientes/ej1", FORMS = "/app/expedientes/ej1/formularios";

describe("guía interactiva · fase «el ejemplo» (6 pasos, todos en la ficha)", () => {
  it("solo acompaña a las cuentas nacidas con ella (05/09/2026): las anteriores no ven nada", () => {
    expect(pasoDeGuia({ ...base, creadoEn: "2026-07-29T10:00:00" }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T16:59:59" }, FICHA)).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T17:29:00.123Z" }, "/app")?.key).toBe("volver-1");
    expect(pasoDeGuia({ ...base, creadoEn: null }, "/app")).toBeNull();
  });
  it("1: desde el panel lleva a abrir el ejemplo; sin ejemplo sembrado, lo siembra al clic", () => {
    const p = pasoDeGuia(base, "/app")!;
    expect(p).toMatchObject({ key: "volver-1", n: 1, total: PASOS_EJEMPLO, fase: "ejemplo", ir: FICHA, cta: "Abrir el ejemplo" });
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app")?.ir).toBe("/app/ejemplo");
  });
  it("2 → 3: información y documentos se miran en la ficha, abren su sección y avanzan con «Siguiente»", () => {
    expect(pasoDeGuia(base, FICHA)).toMatchObject({ key: "informacion", n: 2, anclaje: "informacion", abrir: "informacion", avanza: 2, cta: "Siguiente" });
    expect(pasoDeGuia(base, FICHA, { vistos: 2 })).toMatchObject({ key: "documentos", n: 3, anclaje: "documentos", abrir: "documentos", avanza: 3 });
    // fuera de la ficha, la tarjeta lleva de vuelta con el MISMO número
    expect(pasoDeGuia(base, "/app/clientes", { vistos: 2 })).toMatchObject({ key: "volver-3", n: 3, ir: FICHA, cta: "Volver al ejemplo" });
  });
  it("4: los formularios se generan de verdad (descarga), no solo se marcan", () => {
    const t = { vistos: 3 };
    expect(pasoDeGuia(base, FICHA, t)).toMatchObject({ key: "generar", n: 4, anclaje: "generar", ir: FORMS, cta: "Ir a formularios" });
    expect(pasoDeGuia(base, FORMS, t)).toMatchObject({ key: "descargar", n: 4, anclaje: "descargar" });
    expect(pasoDeGuia(base, "/app", t)).toMatchObject({ key: "volver-4", n: 4 });
    // hecho el hecho (formulario registrado), el paso 4 desaparece aunque no se haya «marcado»
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    expect(pasoDeGuia(hecho, FORMS, t)).toMatchObject({ key: "volver-5", n: 5, ir: FICHA, cta: "Volver al expediente" });
  });
  it("5 → 6: citas y cobro, y al terminar empieza la fase real", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    expect(pasoDeGuia(hecho, FICHA, { vistos: 3 })).toMatchObject({ key: "citas", n: 5, abrir: "citas", avanza: 5 });
    expect(pasoDeGuia(hecho, FICHA, { vistos: 5 })).toMatchObject({ key: "cobro", n: 6, abrir: "cobro", avanza: 6, cta: "Terminar el ejemplo" });
    expect(pasoDeGuia(hecho, FICHA, { vistos: 6 })).toMatchObject({ key: "cliente", fase: "real", n: 1, total: PASOS_REAL });
  });
  it("la progresión es monótona: cada paso tiene un número mayor que el anterior", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    const ns = [pasoDeGuia(base, "/app")!, pasoDeGuia(base, FICHA)!, pasoDeGuia(base, FICHA, { vistos: 2 })!, pasoDeGuia(base, FICHA, { vistos: 3 })!, pasoDeGuia(base, FORMS, { vistos: 3 })!, pasoDeGuia(hecho, FICHA, { vistos: 3 })!, pasoDeGuia(hecho, FICHA, { vistos: 5 })!].map((p) => p.n);
    expect(ns).toEqual([1, 2, 3, 4, 4, 5, 6]);
  });
  it("si el gestor borra el ejemplo a mitad de visita, no se insiste: fase real", () => {
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app", { vistos: 3 })?.fase).toBe("real");
  });
});

describe("guía interactiva · fase «tu primer expediente real» (4 pasos, por hechos)", () => {
  const real = { ...base, ejemploFormulariosGenerados: true };
  const t = { vistos: 6 };
  it("cliente → su pasaporte → expediente → enlace → nada", () => {
    expect(pasoDeGuia(real, "/app", t)?.key).toBe("cliente");
    expect(pasoDeGuia({ ...real, clientes: 1 }, "/app", t)).toMatchObject({ key: "subir-ir", n: 2 });
    expect(pasoDeGuia({ ...real, clientes: 1 }, "/app/clientes/abc", t)).toMatchObject({ key: "subir", anclaje: "subir", n: 2 });
    expect(pasoDeGuia({ ...real, clientes: 1, documentosPropios: 1 }, "/app", t)).toMatchObject({ key: "expediente", anclaje: "nuevo-expediente", n: 3 });
    expect(pasoDeGuia({ ...real, clientes: 1, documentosPropios: 1, expedientes: 1 }, "/app", t)).toMatchObject({ key: "enlace", n: 4 });
    expect(pasoDeGuia({ ...real, clientes: 1, documentosPropios: 1, expedientes: 1, enlacesEnviados: 1 }, "/app", t)).toBeNull();
  });
});
