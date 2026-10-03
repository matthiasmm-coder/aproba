import { describe, expect, it } from "vitest";
import { GRIS_SIN_ASIGNAR, PALETA_AGENDA, SIN_ASIGNAR, colorDeMiembro, filtrarPorMiembro, nombreCorto } from "@/lib/agenda-miembros";

// Agenda por miembro (Jennifer, 03/10/2026): un color por persona y un filtro.
describe("agenda por miembro", () => {
  const equipo = [{ id: "u1", nombre: "Alexandra Ventura" }, { id: "u2", nombre: "Jennifer Ibarra" }];
  it("cada miembro, su color (en el orden del equipo); sin asignar, gris", () => {
    expect(colorDeMiembro(equipo, "u1")).toBe(PALETA_AGENDA[0]);
    expect(colorDeMiembro(equipo, "u2")).toBe(PALETA_AGENDA[1]);
    expect(colorDeMiembro(equipo, null)).toBe(GRIS_SIN_ASIGNAR);
    expect(colorDeMiembro(equipo, "ex-miembro")).toBe(GRIS_SIN_ASIGNAR);
  });
  it("filtra: todos, una persona, o las citas sin nadie", () => {
    const citas = [{ id: "a", asignadoAId: "u1" }, { id: "b", asignadoAId: "u2" }, { id: "c", asignadoAId: null }];
    expect(filtrarPorMiembro(citas, "").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(filtrarPorMiembro(citas, "u2").map((c) => c.id)).toEqual(["b"]);
    expect(filtrarPorMiembro(citas, SIN_ASIGNAR).map((c) => c.id)).toEqual(["c"]);
  });
  it("nombre corto para los chips", () => {
    expect(nombreCorto("Alexandra Ventura")).toBe("Alexandra V.");
    expect(nombreCorto("OFICINA GRAN VIA")).toBe("OFICINA G.");
    expect(nombreCorto("Jennifer")).toBe("Jennifer");
  });
});
