import { describe, it, expect } from "vitest";
import { pasoDeGuia, TOTAL_PASOS } from "./guia";
import type { DatosActivacion } from "./activacion";

const base: DatosActivacion = {
  clientes: 0, expedientes: 0, enlacesEnviados: 0, subidasDeCliente: 0,
  servicios: 5, cuentas: 0, miembros: 1, plan: "PRO",
  ejemploId: "ej1", ejemploFormulariosGenerados: false, documentosPropios: 0,
  creadoEn: "2026-09-06T09:00:00",
};
const FICHA = "/app/expedientes/ej1", FORMS = "/app/expedientes/ej1/formularios", NUEVO = "/app/expedientes/nuevo", TABLERO = "/app/expedientes";

describe("guía interactiva · una sola secuencia de 9 pasos", () => {
  it("solo acompaña a las cuentas nacidas con ella (05/09/2026): las anteriores no ven nada", () => {
    expect(pasoDeGuia({ ...base, creadoEn: "2026-07-29T10:00:00" }, "/app")).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: "2026-09-05T16:59:59" }, FICHA)).toBeNull();
    expect(pasoDeGuia({ ...base, creadoEn: null }, "/app")).toBeNull();
    expect(TOTAL_PASOS).toBe(9);
  });
  it("1 → 2: el menú Expedientes en el panel, la tarjeta del ejemplo en el tablero; el botón solo si el elemento no está", () => {
    expect(pasoDeGuia(base, "/app")).toMatchObject({ key: "menu", n: 1, anclaje: "menu-expedientes", ir: TABLERO, cta: "Ver expedientes", ctaSoloSinAncla: true });
    expect(pasoDeGuia(base, TABLERO)).toMatchObject({ key: "tarjeta", n: 2, anclaje: "tarjeta-ejemplo", ir: FICHA, cta: "Abrir el ejemplo", ctaSoloSinAncla: true });
    expect(pasoDeGuia(base, "/app/clientes")).toMatchObject({ key: "volver-1", n: 1, ir: TABLERO, cta: "Ver expedientes" });
    expect(pasoDeGuia({ ...base, ejemploId: null }, TABLERO)?.ir).toBe("/app/ejemplo"); // sin ejemplo: se siembra al clic
  });
  it("3 → 6: información, documentos, citas y cobro en la ficha, abren su sección y avanzan con «Siguiente»", () => {
    expect(pasoDeGuia(base, FICHA)).toMatchObject({ key: "informacion", n: 3, abrir: "informacion", avanza: 3, cta: "Siguiente" });
    expect(pasoDeGuia(base, FICHA, { vistos: 3 })).toMatchObject({ key: "documentos", n: 4, abrir: "documentos", avanza: 4 });
    expect(pasoDeGuia(base, FICHA, { vistos: 4 })).toMatchObject({ key: "citas", n: 5, abrir: "citas", avanza: 5 });
    expect(pasoDeGuia(base, FICHA, { vistos: 5 })).toMatchObject({ key: "cobro", n: 6, abrir: "cobro", avanza: 6 });
    expect(pasoDeGuia(base, "/app/clientes", { vistos: 4 })).toMatchObject({ key: "volver-5", n: 5, ir: FICHA, cta: "Volver al ejemplo" });
  });
  it("7: los formularios van al final y se generan de verdad (descarga); después NO hay que volver", () => {
    const t = { vistos: 6 };
    expect(pasoDeGuia(base, FICHA, t)).toMatchObject({ key: "generar", n: 7, anclaje: "generar", ir: FORMS, cta: "Ir a formularios" });
    expect(pasoDeGuia(base, FORMS, t)).toMatchObject({ key: "descargar", n: 7, anclaje: "descargar", cta: "" });
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    expect(pasoDeGuia(hecho, FORMS, t)).toMatchObject({ key: "expediente", n: 8, anclaje: "nuevo-expediente", ir: NUEVO });
  });
  it("8: el expediente real — «Cliente nuevo» señalado y, ya dentro, tarjeta flotante sin botón; nunca pide teclear al cliente aparte", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true }; const t = { vistos: 6 };
    expect(pasoDeGuia(hecho, "/app", t)).toMatchObject({ key: "expediente", n: 8, cta: "Nuevo expediente" });
    const enForm = pasoDeGuia(hecho, NUEVO, t)!;
    expect(enForm).toMatchObject({ key: "crear-expediente", n: 8, anclajes: ["cliente-nuevo"], cta: "" });
    expect(enForm.textos?.["cliente-nuevo"]?.titulo).toBe("Pulsa «Cliente nuevo»");
    expect(pasoDeGuia({ ...hecho, clientes: 1, documentosPropios: 0 }, "/app", t)?.key).toBe("expediente");
  });
  it("9: copiar el enlace (campo señalado, se confirma con el botón) → qué hará el cliente → fin", () => {
    const con = { ...base, ejemploFormulariosGenerados: true, expedientes: 1, enlacesEnviados: 1 }; const t = { vistos: 6 };
    expect(pasoDeGuia(con, NUEVO, t)).toMatchObject({ key: "copiar-enlace", n: 9, anclaje: "enlace-portal", copia: true, cta: "Ya se lo he enviado" });
    expect(pasoDeGuia(con, "/app", t)).toMatchObject({ key: "enlace", n: 9, copia: true });
    expect(pasoDeGuia(con, NUEVO, { ...t, enlaceCopiado: true })).toMatchObject({ key: "fin", n: 9, termina: true, cta: "Terminar la guía" });
    expect(pasoDeGuia(con, "/app", { ...t, enlaceCopiado: true, enlaceVisto: true })).toBeNull();
  });
  it("la progresión es monótona de principio a fin", () => {
    const hecho = { ...base, ejemploFormulariosGenerados: true };
    const ns = [pasoDeGuia(base, "/app")!, pasoDeGuia(base, TABLERO)!, pasoDeGuia(base, FICHA)!, pasoDeGuia(base, FICHA, { vistos: 3 })!, pasoDeGuia(base, FICHA, { vistos: 4 })!, pasoDeGuia(base, FICHA, { vistos: 5 })!, pasoDeGuia(base, FICHA, { vistos: 6 })!, pasoDeGuia(base, FORMS, { vistos: 6 })!, pasoDeGuia(hecho, FORMS, { vistos: 6 })!, pasoDeGuia(hecho, NUEVO, { vistos: 6 })!, pasoDeGuia({ ...hecho, expedientes: 1 }, NUEVO, { vistos: 6 })!, pasoDeGuia({ ...hecho, expedientes: 1 }, NUEVO, { vistos: 6, enlaceCopiado: true })!].map((p) => p.n);
    expect(ns).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 9, 9]);
  });
  it("si el gestor borra el ejemplo a mitad de visita, no se insiste: sigue con lo real", () => {
    expect(pasoDeGuia({ ...base, ejemploId: null }, "/app", { vistos: 4 })?.key).toBe("expediente");
  });
});
