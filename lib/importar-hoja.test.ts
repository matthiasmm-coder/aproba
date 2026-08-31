import { describe, it, expect } from "vitest";

// Elección de hoja en la importación. El 31/08/2026, durante la sesión con Sandra
// (LexPats), Aproba intentó importar la pestaña «Instrucciones» de NUESTRA propia
// plantilla como si fueran clientes: se cogía la hoja con MÁS FILAS, y las 16 líneas
// de instrucciones superan a los clientes de cualquier despacho pequeño.
// Regla correcta: una hoja de datos es ANCHA (muchas columnas por fila); una de
// instrucciones es estrecha (una sola). Se puntúa por anchura, se desempata por altura.

type Hoja = { nombre: string; filas: string[][] };

const anchura = (h: Hoja) => {
  const cuerpo = h.filas.slice(0, 40);
  if (!cuerpo.length) return 0;
  return cuerpo.reduce((n, f) => n + f.filter((c) => c !== "").length, 0) / cuerpo.length;
};
const puntua = (h: Hoja) => [anchura(h) >= 3 ? 1 : 0, anchura(h), h.filas.length] as const;
const mejor = (a: Hoja, b: Hoja) => {
  const [pa, aa, fa] = puntua(a), [pb, ab, fb] = puntua(b);
  if (pa !== pb) return pa > pb ? a : b;
  if (Math.abs(aa - ab) > 0.5) return aa > ab ? a : b;
  return fb > fa ? b : a;
};
const elegir = (hojas: Hoja[]) => hojas.reduce(mejor);

const fila = (n: number, i = 0) => Array.from({ length: n }, (_, k) => `c${i}_${k}`);
const instrucciones = (n: number): Hoja => ({ nombre: "Instrucciones", filas: Array.from({ length: n }, (_, i) => [`línea de ayuda ${i}`]) });
const clientes = (n: number, cols = 12): Hoja => ({ nombre: "Clientes", filas: Array.from({ length: n }, (_, i) => fila(cols, i)) });

describe("elección de hoja", () => {
  it("el caso Sandra: 9 clientes vs 16 líneas de instrucciones → gana Clientes", () => {
    expect(elegir([clientes(11), instrucciones(16)]).nombre).toBe("Clientes");
  });

  it("orden inverso en el fichero: el resultado no cambia", () => {
    expect(elegir([instrucciones(16), clientes(11)]).nombre).toBe("Clientes");
  });

  it("un solo cliente sigue ganando a 40 líneas de instrucciones", () => {
    expect(elegir([clientes(2), instrucciones(40)]).nombre).toBe("Clientes");
  });

  it("entre dos hojas de datos, gana la que tiene más filas", () => {
    const pocos = { ...clientes(5), nombre: "Hoja1" };
    const muchos = { ...clientes(300), nombre: "Hoja2" };
    expect(elegir([pocos, muchos]).nombre).toBe("Hoja2");
  });

  it("hoja única: se devuelve aunque sea estrecha", () => {
    expect(elegir([instrucciones(10)]).nombre).toBe("Instrucciones");
  });

  it("hoja vacía no gana nunca", () => {
    const vacia = { nombre: "Vacía", filas: [] as string[][] };
    expect(elegir([vacia, clientes(3)]).nombre).toBe("Clientes");
  });
});
