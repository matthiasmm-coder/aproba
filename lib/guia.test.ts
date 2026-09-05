import { describe, it, expect } from "vitest";
import { pasoDeGuia, TOTAL_PASOS } from "./guia";
import type { DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 5, cuentas: 0, miembros: 1, plan: "PRO",
  ejemploId: "ej1", ejemploFormulariosGenerados: false, documentosPropios: 0,
  creadoEn: "2026-09-06T09:00:00",
};
const FICHA = "/app/expedientes/ej1", FORMS = "/app/expedientes/ej1/formularios", NUEVO = "/app/expedientes/nuevo";

describe("guía interactiva · una sola secuencia de 8 pasos", () => {
  it("solo acompaña a las cuentas nacidas con ella (05/09/2026): las anteriores no ven nada", () => {
    expect(pasoDeGuia({ ...base, creadoEn: "2026-07-29T10:00:00" }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T16:59:59" }, FICHA)).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T17:29:00.123Z" }, "/app")?.key).toBe("volver-1");
    expect(pasoDeGuia({ ...base, creadoEn: null }, "/app")).toBeNull();
  });
  it("1: desde el panel lleva a abrir el ejemplo; sin ejemplo sembrado, lo siembra al clic", () => {
    expect(pasoDeGuia(base, "/app")).toMatchObject({ key: "volver-1", n: 1, ir: FICHA, cta: "Abrir el ejemplo" });
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app")?.ir).toBe("/app/ejemplo");
    expect(TOTAL_PASOS).toBe(8);
  });
  it("2 → 5: información, documentos, citas y cobro se miran en la ficha, abren su sección y avanzan con «Siguiente»", () => {
    expect(pasoDeGuia(base, FICHA)).toMatchObject({ key: "informacion", n: 2, abrir: "informacion", avanza: 2, cta: "Siguiente" });
    expect(pasoDeGuia(base, FICHA, { vistos: 2 })).toMatchObject({ key: "documentos", n: 3, abrir: "documentos", avanza: 3 });
    expect(pasoDeGuia(base, FICHA, { vistos: 3 })).toMatchObject({ key: "citas", n: 4, abrir: "citas", avanza: 4 });
    expect(pasoDeGuia(base, FICHA, { vistos: 4 })).toMatchObject({ key: "cobro", n: 5, abrir: "cobro", avanza: 5 });
    // fuera de la ficha, la tarjeta lleva de vuelta con el MISMO número
    expect(pasoDeGuia(base, "/app/clientes", { vistos: 3 })).toMatchObject({ key: "volver-4", n: 4, ir: FICHA, cta: "Volver al ejemplo" });
  });
  it("6: los formularios van al final de la ficha y se generan de verdad (descarga); después NO hay que volver", () => {
    const t = { vistos: 5 };
    expect(pasoDeGuia(base, FICHA, t)).toMatchObject({ key: "generar", n: 6, anclaje: "generar", ir: FORMS, cta: "Ir a formularios" });
    expect(pasoDeGuia(base, FORMS, t)).toMatchObject({ key: "descargar", n: 6, anclaje: "descargar", cta: "" });
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    // generado: el siguiente paso ya es el expediente real, señalado en el botón de cabecera de ESTA página
    expect(pasoDeGuia(hecho, FORMS, t)).toMatchObject({ key: "expediente", n: 7, anclaje: "nuevo-expediente", ir: NUEVO });
  });
  it("7: el expediente real — «Cliente nuevo» señalado y, ya dentro, tarjeta flotante sin botón", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true }; const t = { vistos: 5 };
    expect(pasoDeGuia(hecho, "/app", t)).toMatchObject({ key: "expediente", n: 7, cta: "Nuevo expediente" });
    const enForm = pasoDeGuia(hecho, NUEVO, t)!;
    expect(enForm).toMatchObject({ key: "crear-expediente", n: 7, anclajes: ["cliente-nuevo"], cta: "" });
    expect(enForm.textos?.["cliente-nuevo"]?.titulo).toBe("Pulsa «Cliente nuevo»");
    // no pide teclear al cliente ni subir su pasaporte
    expect(pasoDeGuia({ ...hecho, clientes: 1, documentosPropios: 0 }, "/app", t)?.key).toBe("expediente");
  });
  it("8: enviar el enlace cierra la guía con el botón; después, nada", () => {
    const con = { ...base, ejemploFormulariosGenerados: true, expedientes: 1, enlacesEnviados: 1 }; const t = { vistos: 5 };
    expect(pasoDeGuia(con, NUEVO, t)).toMatchObject({ key: "enviar-enlace", n: 8, anclaje: "enviar-enlace", termina: true, cta: "Terminar la guía" });
    expect(pasoDeGuia(con, "/app", t)).toMatchObject({ key: "enlace", n: 8, termina: true });
    expect(pasoDeGuia(con, "/app", { ...t, enlaceVisto: true })).toBeNull();
  });
  it("la progresión es monótona de principio a fin", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    const ns = [pasoDeGuia(base, "/app")!, pasoDeGuia(base, FICHA)!, pasoDeGuia(base, FICHA, { vistos: 2 })!, pasoDeGuia(base, FICHA, { vistos: 3 })!, pasoDeGuia(base, FICHA, { vistos: 4 })!, pasoDeGuia(base, FICHA, { vistos: 5 })!, pasoDeGuia(base, FORMS, { vistos: 5 })!, pasoDeGuia(hecho, FORMS, { vistos: 5 })!, pasoDeGuia(hecho, NUEVO, { vistos: 5 })!, pasoDeGuia({ ...hecho, expedientes: 1 }, NUEVO, { vistos: 5 })!].map((p) => p.n);
    expect(ns).toEqual([1, 2, 3, 4, 5, 6, 6, 7, 7, 8]);
  });
  it("si el gestor borra el ejemplo a mitad de visita, no se insiste: sigue con lo real", () => {
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app", { vistos: 3 })?.key).toBe("expediente");
  });
});
