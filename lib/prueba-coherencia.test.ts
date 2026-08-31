import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CA } from "./app-i18n";

// La duración de la prueba ha cambiado dos veces (14 → 1 mes → 15 días) y cada vez
// se quedó algún texto atrás: Ricardo vio, el 31/08/2026, un botón «15 días gratis»
// justo debajo de un párrafo «Prueba gratis de 1 mes». El fallo no es de lógica sino
// de textos que se mueven por separado — así que se vigila con una prueba, no con
// buena memoria. Si algún día la duración cambia de verdad, DIAS es lo único a tocar.

const DIAS = 15;

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...tsx(p)); }
    // Solo lo que pinta interfaz: las rutas de API no enseñan texto al usuario
    // (el cron del pipeline habla de «≤7 días de prueba restantes» en un comentario).
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const FUENTES = [...tsx("app"), ...tsx("components")];

// Toda mención de duración pegada a «gratis» o «de prueba»: 15 días y nada más.
const DURACION = /(\d+)\s*(?:d[ií]as|mes(?:es)?)\s*(?:gratis|de prueba)|prueba\s+(?:gratis\s+)?de\s+(\d+)\s*(?:d[ií]as|mes(?:es)?)|(un|1)\s+mes\s+(?:gratis|de prueba)/gi;

describe("duración de la prueba · textos de la interfaz", () => {
  it("ningún texto anuncia una duración distinta de 15 días", () => {
    const malos: string[] = [];
    for (const f of FUENTES) {
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((l, i) => {
        // «2 meses gratis» es el descuento del plan anual, no la prueba.
        if (/2\s*meses\s*gratis/i.test(l)) return;
        // Los comentarios pueden citar duraciones antiguas al explicar un cambio.
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        for (const m of l.matchAll(DURACION)) {
          const n = m[1] ?? m[2] ?? m[3];
          const enDias = /mes/i.test(m[0]);
          if (enDias || Number(n) !== DIAS) malos.push(`${f}:${i + 1} → «${m[0].trim()}»`);
        }
      });
    }
    expect(malos).toEqual([]);
  });

  it("el diccionario catalán no conserva claves de una duración antigua", () => {
    const viejas = Object.keys(CA).filter(
      (k) => /\d+\s*d[ií]as\s*(gratis|de prueba)|prueba de \d+ d[ií]as|(un|1) mes gratis/i.test(k)
             && !k.includes(`${DIAS} días`),
    );
    expect(viejas).toEqual([]);
  });

  it("las traducciones catalanas de la prueba hablan de la misma duración que su clave", () => {
    const incoherentes = Object.entries(CA)
      .filter(([k]) => k.includes(`${DIAS} días`))
      .filter(([, v]) => !v.includes(`${DIAS} dies`));
    expect(incoherentes).toEqual([]);
  });
});
