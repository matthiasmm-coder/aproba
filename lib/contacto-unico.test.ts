import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TITULAR } from "./legal";
import { CONTACTO } from "./contacto";

// Una sola dirección de contacto en todo el sitio (Matthias, 30/09/2026): la de gmail. Las
// direcciones @aproba-software.com que quedan no son de contacto: la cuenta de demostración
// (demo@), el cliente ficticio del expediente de ejemplo (ejemplo@) y los buzones de entrada
// de documentos (docs-…@in.aproba-software.com).
const CONTACTO_UNICO = "aproba.software@gmail.com";
const PERMITIDAS = new Set(["demo@aproba-software.com", "ejemplo@aproba-software.com"]);

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" || n.startsWith(".") ? [] : ficheros(p);
    return /\.(tsx?|md|txt)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

describe("contacto único del sitio", () => {
  it("el titular y la ficha del fundador usan la misma dirección", () => {
    expect(TITULAR.email).toBe(CONTACTO_UNICO);
    expect(TITULAR.emailPrivacidad).toBe(CONTACTO_UNICO);
    expect(TITULAR.emailLegal).toBe(CONTACTO_UNICO);
    expect(CONTACTO.email).toBe(CONTACTO_UNICO);
  });

  it("no queda ninguna dirección de contacto @aproba-software.com en el código del sitio", () => {
    const halladas: string[] = [];
    for (const dir of ["app", "components", "lib", "public"]) {
      for (const f of ficheros(dir)) {
        for (const m of readFileSync(f, "utf8").matchAll(/[A-Za-z0-9._+-]+@(?:in\.)?aproba-software\.com/g)) {
          const dirEmail = m[0];
          if (dirEmail.includes("@in.") || PERMITIDAS.has(dirEmail)) continue;
          halladas.push(`${f}: ${dirEmail}`);
        }
      }
    }
    expect(halladas).toEqual([]);
  });
});
