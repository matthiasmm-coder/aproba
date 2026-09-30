import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { formulariosOficiales } from "./ex-forms";
import { TASAS } from "./tasas";

// Cuántos modelos y tasas anuncia el sitio, en CUALQUIER texto (metadescripciones, manifest,
// fichas, FAQ, páginas SEO, base del asistente), atado al código que los genera. El 30/09/2026
// Bing sacó la metadescripción de la portada con «25 formularios EX y las tasas 790 (012, 052,
// 062, 026)»: el producto tenía 27 EX y 5 tasas desde hacía semanas, y el test de la landing
// (landing-cifras.test.ts) solo miraba app/page.tsx. Complementa ese test, no lo sustituye.
const raiz = process.cwd();
const ficheros = [
  "app/layout.tsx", "app/manifest.ts", "app/page.tsx", "app/llms.txt/route.ts",
  ...readdirSync(path.join(raiz, "lib")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `lib/${f}`),
  ...readdirSync(path.join(raiz, "components")).filter((f) => f.endsWith(".tsx")).map((f) => `components/${f}`),
];

// Las líneas de comentario cuentan historia («decía 25…»), no anuncian nada.
const texto = (f: string) => readFileSync(path.join(raiz, f), "utf8").split("\n")
  .map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? "" : l)).join("\n");

const ex = formulariosOficiales().filter((c) => c.startsWith("EX-")).length;
const mi = formulariosOficiales().filter((c) => c.startsWith("MI-")).length;
const REGLAS: { nombre: string; re: RegExp; esperado: number }[] = [
  { nombre: "modelos EX", re: /(?<![\d-])(\d+) (?:formularios |modelos )?EX(?![-\w])/g, esperado: ex },
  { nombre: "modelos MI", re: /(?<![\d-])(\d+) (?:modelos )?(?:de movilidad internacional|MI(?![-\w])|de la Ley 14\/2013)/gi, esperado: mi },
  { nombre: "modelos en total", re: /(?<![\d-])(\d+) modelos(?! EX| MI| de movilidad)(?![-\w])/gi, esperado: ex + mi },
  { nombre: "formularios y tasas", re: /(?<![\d-])(\d+) formularios y tasas/g, esperado: ex + mi + TASAS.length },
  { nombre: "tasas", re: /(?<![\d-])(\d+) tasas(?![-\w])/g, esperado: TASAS.length },
];

describe("cifras de modelos y tasas en todo el sitio", () => {
  it("el catálogo del código es el que se anuncia (27 EX, 3 MI, 5 tasas a 30/09/2026)", () => {
    expect(ex).toBeGreaterThan(0);
    expect(mi).toBeGreaterThan(0);
    expect(TASAS.length).toBeGreaterThan(0);
  });

  for (const regla of REGLAS) {
    it(`«N ${regla.nombre}» = ${regla.esperado}, como en el código`, () => {
      const malas: string[] = [];
      for (const f of ficheros) {
        for (const m of texto(f).matchAll(regla.re)) {
          if (Number(m[1]) !== regla.esperado) malas.push(`${f}: «${m[0]}»`);
        }
      }
      expect(malas).toEqual([]);
    });
  }

  it("la metadescripción de la portada cabe entera en un resultado de búsqueda", () => {
    const layout = readFileSync(path.join(raiz, "app/layout.tsx"), "utf8");
    const desc = /description:\s*"([^"]+)"/.exec(layout)?.[1] ?? "";
    expect(desc, "no se encuentra la description de app/layout.tsx").not.toBe("");
    expect(desc.length, "Google y Bing la cortan pasados ~160 caracteres").toBeLessThanOrEqual(160);
  });
});
