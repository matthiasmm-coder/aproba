import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formulariosOficiales } from "./ex-forms";

// Las cifras que anuncia la landing tienen que ser CIERTAS. Ya se quedaron atrás dos veces
// (decía «13 modelos EX» con 14 mapeados, y «15 formularios y tasas» con 28 reales): un
// número inflado en la home es una promesa que el producto no cumple, y uno corto regala
// trabajo hecho. Este test las ata al código que las produce.
const TASAS = ["790-012", "790-052", "790-026"]; // las tres que Aproba genera de verdad
const home = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");

describe("cifras de la landing", () => {
  it("«N formularios y tasas oficiales» = modelos EX mapeados + tasas", () => {
    const m = /\{ n: "(\d+)", l: "formularios y tasas oficiales en un clic"/.exec(home);
    expect(m, "no se encuentra la estadística en app/page.tsx (¿cambió el texto?)").toBeTruthy();
    expect(Number(m![1])).toBe(formulariosOficiales().length + TASAS.length);
  });

  it("el módulo «Formularios en un clic» anuncia los modelos EX que existen y las tres tasas", () => {
    const m = /desc: "(\d+) modelos EX y las tasas ([^"]+)"/.exec(home);
    expect(m, "no se encuentra el módulo de formularios en app/page.tsx").toBeTruthy();
    expect(Number(m![1])).toBe(formulariosOficiales().length);
    for (const t of TASAS) expect(m![2], `la landing no menciona la tasa ${t}`).toContain(t);
  });
});
