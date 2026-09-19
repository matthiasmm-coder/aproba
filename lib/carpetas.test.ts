import { describe, expect, it } from "vitest";
import { arbolCarpetas, esPack, moverItem, nombreLibre, precioDeItem, puedeVerCarpeta, quitarCarpeta, renombrarCarpeta, rutaDeCarpeta, type Carpeta, type Item } from "./carpetas";
import type { Servicio } from "./servicios";

const c = (id: string, nombre: string, parentId: string | null = null, orden = 0, usuarios?: string[]): Carpeta => ({ id, nombre, parentId, orden, usuarios });
const s = (id: string, x: Partial<Servicio> = {}): Item =>
  ({ id, label: id, desc: "", docs: [], active: true, precio: 0, anticipo: 0, resto: 0, ...x }) as Item;

describe("carpetas del catálogo", () => {
  it("dos niveles, ordenados; una subcarpeta huérfana sube a la raíz en vez de perderse", () => {
    const cs = [c("a", "Arraigo", null, 2), c("b", "Familia", null, 1), c("a1", "Especiales", "a"), c("x", "Perdida", "no-existe")];
    const arbol = arbolCarpetas(cs);
    expect(arbol.map((n) => n.carpeta.nombre)).toEqual(["Familia", "Arraigo", "Perdida"]);
    expect(arbol.find((n) => n.carpeta.id === "a")!.hijas.map((h) => h.nombre)).toEqual(["Especiales"]);
  });

  it("el acceso reserva la carpeta, y un administrador lo ve todo", () => {
    const abierta = c("a", "Arraigo");
    const reservada = c("b", "Sueldos", null, 0, ["u1"]);
    expect(puedeVerCarpeta(abierta, "u2", false)).toBe(true);
    expect(puedeVerCarpeta(reservada, "u1", false)).toBe(true);
    expect(puedeVerCarpeta(reservada, "u2", false)).toBe(false);
    expect(puedeVerCarpeta(reservada, "u2", true)).toBe(true); // admin
    expect(puedeVerCarpeta(undefined, null, false)).toBe(true); // sin carpeta: de todos
  });

  it("un servicio con servicios dentro ES un pack, y su precio es la suma menos el descuento", () => {
    const uno = s("nie", { anticipo: 60, resto: 30 });
    const dos = s("tie", { anticipo: 100, resto: 80 });
    const pack = s("pack_1", { servicioIds: ["nie", "tie"], descuentoPct: 10 });
    expect(esPack(pack)).toBe(true);
    expect(esPack(uno)).toBe(false);
    expect(precioDeItem(uno, [uno, dos, pack])).toMatchObject({ total: 90 });
    expect(precioDeItem(pack, [uno, dos, pack])).toEqual({ suma: 270, total: 243, pct: 10 });
  });

  it("borrar una carpeta NO borra lo que hay dentro: las hijas suben y los servicios quedan a la vista", () => {
    const cs = [c("a", "Arraigo"), c("a1", "Especiales", "a")];
    const items = [s("x", { temaId: "a", categoria: "Arraigo" }), s("y", { temaId: "a1", categoria: "Especiales" })];
    const r = quitarCarpeta(cs, items, "a");
    expect(r.carpetas.map((k) => [k.id, k.parentId])).toEqual([["a1", null]]);
    expect(r.items.find((i) => i.id === "x")).toMatchObject({ temaId: null, categoria: "" });
    expect(r.items.find((i) => i.id === "y")).toMatchObject({ temaId: "a1" }); // intacto
  });

  it("mover un servicio actualiza la categoría que leen el portal y el árbol", () => {
    const cs = [c("a", "Arraigo"), c("b", "Familia")];
    const items = [s("x", { temaId: "a", categoria: "Arraigo" })];
    expect(moverItem(items, cs, "x", "b")[0]).toMatchObject({ temaId: "b", categoria: "Familia" });
    expect(moverItem(items, cs, "x", null)[0]).toMatchObject({ temaId: null, categoria: "" });
  });

  it("renombrar arrastra el nombre a los servicios de dentro", () => {
    const cs = [c("a", "Arraigo")];
    const items = [s("x", { temaId: "a", categoria: "Arraigo" }), s("y", { temaId: null })];
    const r = renombrarCarpeta(cs, items, "a", "  Arraigos  ");
    expect(r.carpetas[0].nombre).toBe("Arraigos");
    expect(r.items[0].categoria).toBe("Arraigos");
    expect(r.items[1].categoria).toBeUndefined();
  });

  it("no deja dos carpetas hermanas con el mismo nombre", () => {
    const cs = [c("a", "Arraigo"), c("a1", "Especiales", "a")];
    expect(nombreLibre(cs, "arraigo ", null)).toBe(false);
    expect(nombreLibre(cs, "Arraigo", "a")).toBe(true);      // otra rama, sin conflicto
    expect(nombreLibre(cs, "Arraigo", null, "a")).toBe(true); // ella misma
    expect(nombreLibre(cs, "  ", null)).toBe(false);
  });

  it("la ruta enseña dónde vive un servicio", () => {
    const cs = [c("a", "Arraigo"), c("a1", "Especiales", "a")];
    expect(rutaDeCarpeta(cs, "a1")).toEqual(["Arraigo", "Especiales"]);
    expect(rutaDeCarpeta(cs, "a")).toEqual(["Arraigo"]);
    expect(rutaDeCarpeta(cs, null)).toEqual([]);
  });
});
