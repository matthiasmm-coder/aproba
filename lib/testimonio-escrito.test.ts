import { describe, expect, it } from "vitest";
import { repartir } from "./testimonio";

// 28/09/2026 — la cita del testimonio se escribe letra a letra; lo pendiente va en
// transparente para que ninguna línea cambie al escribir.
const PARTES = [{ t: "Mi idea es que " }, { t: "todos los asuntos", marca: true }, { t: " se gestionen." }];

describe("repartir — lo escrito y lo pendiente de cada parte", () => {
  it("al empezar no hay nada escrito y el texto entero sigue en el DOM", () => {
    const r = repartir(PARTES, 0);
    expect(r.map((p) => p.escrito).join("")).toBe("");
    expect(r.map((p) => p.pendiente).join("")).toBe(PARTES.map((p) => p.t).join(""));
  });
  it("a mitad de la marca, la marca solo cubre lo escrito", () => {
    const r = repartir(PARTES, 15 + 5);
    expect(r[1]).toEqual({ escrito: "todos", pendiente: " los asuntos", marca: true });
    expect(r[2].escrito).toBe("");
  });
  it("al terminar todo está escrito, y pasarse no rompe nada", () => {
    for (const n of [46, 999]) expect(repartir(PARTES, n).every((p) => !p.pendiente)).toBe(true);
    expect(repartir(PARTES, -3)[0].escrito).toBe("");
  });
});
