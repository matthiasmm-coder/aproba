import { describe, expect, it } from "vitest";
import { construirArbol, grupoDe, raizDe, type ItemArbol, type PackLite } from "./expedientes-arbol";

const TEMAS = ["Nacionalidad", "Residencia", "Arraigo"];
const PACKS: PackLite[] = [{ id: "p1", nombre: "Pack llegada", servicioIds: ["nie", "empadronamiento"] }];

const it0 = (x: Partial<ItemArbol>): ItemArbol => ({ tipoLabel: "Otro trámite", ...x });
const opciones = (porAnios = false) => ({
  temas: TEMAS, packs: PACKS, porAnios,
  ordenarFilas: (l: ItemArbol[]) => l,
  etiquetaSinClasificar: "Sin clasificar",
  etiquetaSinFecha: "Sin fecha",
});

const cuenta = (arbol: ReturnType<typeof construirArbol<ItemArbol>>) =>
  arbol.reduce((n, r) => n + r.filas.length + r.grupos.reduce((m, g) => m + g.lista.length, 0), 0);

describe("árbol de expedientes", () => {
  // EL invariante: la pantalla es la casa del gestor. Un expediente que no cae en
  // ninguna carpeta es un expediente perdido — peor que uno mal colocado.
  it("coloca CADA expediente exactamente una vez", () => {
    const lista = [
      it0({ tema: "Nacionalidad", servicioLabel: "Nacionalidad por residencia", claves: ["nac"] }),
      it0({ tema: "Residencia", servicioLabel: "Renovación de TIE", claves: ["tie"] }),
      it0({ tema: "  ", servicioLabel: "Cita previa", claves: ["cita"] }),   // sin tema, con servicio
      it0({ tema: null, servicioLabel: null, claves: [] }),                   // sin nada
      it0({ tema: "Tema nuevo (no está en Ajustes)", servicioLabel: "Algo", claves: ["x"] }),
    ];
    const arbol = construirArbol(lista, opciones());
    expect(cuenta(arbol)).toBe(lista.length);
    expect(arbol.reduce((n, r) => n + r.n, 0)).toBe(lista.length);
  });

  it("ordena: los temas de Ajustes primero, los temas desconocidos después, «Sin clasificar» al final", () => {
    const arbol = construirArbol([
      it0({ tema: null, servicioLabel: null }),
      it0({ tema: "Arraigo", servicioLabel: "Arraigo social", claves: ["as"] }),
      it0({ tema: "Zzz desconocido", servicioLabel: "Algo", claves: ["z"] }),
      it0({ tema: "Nacionalidad", servicioLabel: "Por residencia", claves: ["n"] }),
      it0({ tema: null, servicioLabel: "Servicio suelto", claves: ["s"] }),
    ], opciones());
    expect(arbol.map((r) => r.titulo)).toEqual(["Nacionalidad", "Arraigo", "Zzz desconocido", "Servicio suelto", "Sin clasificar"]);
  });

  it("agrupa por PACK solo si el expediente lleva todos sus servicios", () => {
    const completo = it0({ tema: "Residencia", servicioLabel: "Asignación de NIE", claves: ["nie", "empadronamiento"] });
    const parcial = it0({ tema: "Residencia", servicioLabel: "Asignación de NIE", claves: ["nie", "otro"] });
    expect(grupoDe(completo, PACKS)).toBe("Pack llegada");
    expect(grupoDe(parcial, PACKS)).toBe("Asignación de NIE");
    const arbol = construirArbol([completo, parcial], opciones());
    expect(arbol[0].grupos.map((g) => g.nombre).sort()).toEqual(["Asignación de NIE", "Pack llegada"]);
  });

  it("historial: años del más reciente al más antiguo y «Sin fecha» al final", () => {
    const arbol = construirArbol([
      it0({ tema: "Residencia", servicioLabel: "Renovación de TIE", claves: ["tie"], anio: "2019" }),
      it0({ tema: "Residencia", servicioLabel: "Renovación de TIE", claves: ["tie"], anio: null }),
      it0({ tema: "Residencia", servicioLabel: "Renovación de TIE", claves: ["tie"], anio: "2024" }),
      it0({ tema: "Residencia", servicioLabel: "Renovación de TIE", claves: ["tie"], anio: "2019" }),
    ], opciones(true));
    const anios = arbol[0].grupos[0].anios!;
    expect(anios.map((a) => a.nombre)).toEqual(["2024", "2019", "Sin fecha"]);
    expect(anios.map((a) => a.lista.length)).toEqual([1, 2, 1]);
  });

  it("en curso no agrupa por año", () => {
    const arbol = construirArbol([it0({ tema: "Residencia", servicioLabel: "TIE", claves: ["tie"], anio: "2024" })], opciones(false));
    expect(arbol[0].grupos[0].anios).toBeUndefined();
  });

  // El círculo verde del historial cuenta por la MISMA clave con la que se construye el
  // árbol: si divergen, el badge dice «9» sobre una carpeta que tiene otra cosa.
  it("raizDe coincide con la clave de la carpeta construida", () => {
    const lista = [
      it0({ tema: "Residencia", servicioLabel: "TIE", claves: ["tie"] }),
      it0({ tema: null, servicioLabel: "Servicio suelto", claves: ["s"] }),
      it0({ tema: null, servicioLabel: null }),
      it0({ tema: "Residencia", servicioLabel: "Asignación de NIE", claves: ["nie", "empadronamiento"] }),
    ];
    const arbol = construirArbol(lista, opciones());
    const claves = new Set(arbol.map((r) => r.clave));
    for (const e of lista) expect(claves.has(raizDe(e, PACKS))).toBe(true);
    expect(raizDe(lista[3], PACKS)).toBe("tema:residencia"); // clave normalizada
  });
});

describe("temas escritos de varias formas", () => {
  it("«ARRAIGO» y «Arraigo » son UNA carpeta, titulada como en Ajustes", () => {
    const arbol = construirArbol([
      { tipoLabel: "x", tema: "ARRAIGO", servicioLabel: "Arraigo social", claves: ["as"] },
      { tipoLabel: "x", tema: "Arraigo ", servicioLabel: "Arraigo laboral", claves: ["al"] },
      { tipoLabel: "x", tema: "árraigo", servicioLabel: "Arraigo familiar", claves: ["af"] },
    ], { temas: ["Arraigo"], packs: [], porAnios: false, ordenarFilas: (l) => l, etiquetaSinClasificar: "Sin clasificar", etiquetaSinFecha: "Sin fecha" });
    expect(arbol).toHaveLength(1);
    expect(arbol[0].titulo).toBe("Arraigo");
    expect(arbol[0].n).toBe(3);
    expect(arbol[0].grupos).toHaveLength(3);
  });
});

describe("carpetas del catálogo sin expedientes (20/09)", () => {
  const base = { temas: ["Arraigo", "Familia", "Residencia"], packs: [], porAnios: false, ordenarFilas: (l: ItemArbol[]) => l, etiquetaSinClasificar: "Sin clasificar", etiquetaSinFecha: "Sin fecha" };

  it("se ven igual, vacías y DESPUÉS de las que tienen trabajo", () => {
    const arbol = construirArbol(
      [{ tipoLabel: "x", tema: "Arraigo", servicioLabel: "Arraigo social", claves: ["as"] }],
      { ...base, carpetasVacias: ["Residencia", "Familia"] },
    );
    expect(arbol.map((r) => [r.titulo, r.n])).toEqual([["Arraigo", 1], ["Familia", 0], ["Residencia", 0]]);
  });

  it("una carpeta que YA tiene expedientes no se duplica al pasarla como vacía", () => {
    const arbol = construirArbol(
      [{ tipoLabel: "x", tema: "Arraigo", servicioLabel: "Arraigo social", claves: ["as"] }],
      { ...base, carpetasVacias: ["arraigo ", "ARRAIGO"] },
    );
    expect(arbol).toHaveLength(1);
    expect(arbol[0].n).toBe(1);
  });
});
