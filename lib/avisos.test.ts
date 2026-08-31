import { describe, it, expect } from "vitest";
import { combinarAvisos, DEFAULT_AVISOS, esCustom, nuevaClaveCustom, type FilaAviso } from "./avisos";

// Avisos personalizados + ocultar predeterminados (pedido de Sandra/LexPats, 31/08/2026).
// combinarAvisos es LA función que alimenta Ajustes y la lista del despachador: si se
// rompe, o desaparecen personalizaciones del gestor o resucitan avisos «eliminados».

const fila = (over: Partial<FilaAviso>): FilaAviso => ({
  clave: "doc_recibido", evento: "Documento recibido", template: "texto", canal: "email",
  activo: true, orden: 0, ...over,
});

describe("combinarAvisos · predeterminados", () => {
  it("sin filas: la lista canónica tal cual", () => {
    const out = combinarAvisos([]);
    expect(out).toHaveLength(DEFAULT_AVISOS.length);
    expect(out.every((a) => !a.oculto)).toBe(true);
  });

  it("una fila personaliza texto/activo sin tocar el resto", () => {
    const out = combinarAvisos([fila({ template: "MI texto", activo: false })]);
    const d = out.find((a) => a.id === "doc_recibido")!;
    expect(d.template).toBe("MI texto");
    expect(d.activo).toBe(false);
    expect(out.find((a) => a.id === "presentado")!.activo).toBe(true);
  });

  it("oculto=true viaja hasta la lista (el UI lo esconde, el envío lo salta)", () => {
    const out = combinarAvisos([fila({ oculto: true, activo: false })]);
    expect(out.find((a) => a.id === "doc_recibido")!.oculto).toBe(true);
  });

  it("claves obsoletas en base no aparecen", () => {
    const out = combinarAvisos([fila({ clave: "cita_asignada_legacy" })]);
    expect(out.some((a) => a.id === "cita_asignada_legacy")).toBe(false);
  });
});

describe("combinarAvisos · personalizados", () => {
  const custom = fila({ clave: "custom_ab12cd", evento: "Trae tu pasaporte", template: "Hola {nombre}", eventoBase: "cita_cliente", orden: 40 });

  it("se añaden tras los predeterminados, con su eventoBase", () => {
    const out = combinarAvisos([custom]);
    const c = out[out.length - 1];
    expect(c.id).toBe("custom_ab12cd");
    expect(c.eventoBase).toBe("cita_cliente");
    expect(esCustom(c)).toBe(true);
  });

  it("un custom con eventoBase desconocido se descarta (nunca se dispararía)", () => {
    const out = combinarAvisos([fila({ clave: "custom_x", eventoBase: "evento_que_no_existe" })]);
    expect(out.some((a) => a.id === "custom_x")).toBe(false);
  });

  it("varios customs conservan su orden relativo", () => {
    const out = combinarAvisos([
      fila({ clave: "custom_b", evento: "B", eventoBase: "presentado", orden: 12 }),
      fila({ clave: "custom_a", evento: "A", eventoBase: "presentado", orden: 11 }),
    ]);
    const customs = out.filter(esCustom).map((a) => a.evento);
    expect(customs).toEqual(["A", "B"]);
  });

  it("una fila sin prefijo custom_ y sin clave conocida no se cuela como custom", () => {
    const out = combinarAvisos([fila({ clave: "avi_viejo", eventoBase: "presentado" })]);
    expect(out.some((a) => a.id === "avi_viejo")).toBe(false);
  });
});

describe("nuevaClaveCustom", () => {
  it("genera claves custom_ únicas y reconocibles", () => {
    const a = nuevaClaveCustom(), b = nuevaClaveCustom();
    expect(a).toMatch(/^custom_[a-z0-9]{6}$/);
    expect(a).not.toBe(b);
    expect(esCustom({ id: a })).toBe(true);
  });
});
