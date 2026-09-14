import { describe, it, expect } from "vitest";
import { PLANTILLAS, PLANTILLA_AVISO } from "./whatsapp-plantillas";

// Reglas que Meta aplica AL CREAR la plantilla (no en la revisión): si una falla, el despacho
// se queda sin plantilla y los avisos fuera de la ventana de 24 h no salen. Reproducido el
// 14/09/2026 con el número de test: code 100/2388299 «Variables can't be at the start or end
// of the template».
describe("plantillas de WhatsApp (reglas de creación de Meta)", () => {
  it("ninguna empieza ni termina por una variable", () => {
    for (const p of PLANTILLAS) {
      expect(p.body, `${p.name}/${p.language} empieza por variable`).not.toMatch(/^[\s*_~]*\{\{\d+\}\}/);
      expect(p.body, `${p.name}/${p.language} termina por variable`).not.toMatch(/\{\{\d+\}\}[\s*_~.]*$/);
    }
  });
  it("variables 1..n consecutivas, sin dos seguidas, y con un ejemplo por variable", () => {
    for (const p of PLANTILLAS) {
      const vars = [...p.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(vars, `${p.name}/${p.language}`).toEqual([...new Set(vars)]);
      expect(vars, `${p.name}/${p.language}`).toEqual(vars.map((_, i) => i + 1));
      expect(p.body, `${p.name}/${p.language} tiene variables adyacentes`).not.toMatch(/\}\}\s*\{\{/);
      expect(p.ejemplo, `${p.name}/${p.language} ejemplos`).toHaveLength(vars.length);
      for (const e of p.ejemplo) expect(e).not.toMatch(/\n/);
    }
  });
  it("las 3 variables del diseño (despacho · texto · enlace) en los 3 idiomas, cuerpo ≤ 1024", () => {
    const idiomas = PLANTILLAS.filter((p) => p.name === PLANTILLA_AVISO).map((p) => p.language).sort();
    expect(idiomas).toEqual(["en", "es", "fr"]);
    for (const p of PLANTILLAS) {
      expect(p.body.length).toBeLessThanOrEqual(1024);
      expect(p.category).toBe("UTILITY");
      expect(p.body).toContain("{{3}}");
    }
  });
});
