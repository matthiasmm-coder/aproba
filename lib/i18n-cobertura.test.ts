import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CA } from "./app-i18n";
import { DEFAULT_AVISOS } from "./avisos";
import { PLANES, ROLES, TIPOS } from "./planes";
import { FICHA_CAMPOS, GRUPOS } from "./ficha";

// Cobertura catalana de la app gestor. La mecánica del agujero (vista el 31/08/2026):
// cada entrega de UI añade cadenas t("…") y, si nadie piensa en el catalán, caen al
// español en silencio — el gestor de avisos salió así, y el manager anterior estaba
// traducido al 100 %. Esta prueba convierte el olvido en un fallo de CI: toda cadena
// LITERAL que pase por el t() de app-i18n (páginas/componentes que usan lang-provider
// o app-lang) debe tener su clave en CA. Los textos que llegan a t() por variable
// (t(p.para), t(a.evento)…) no se pueden exigir estáticamente y quedan fuera.
// Al añadir una cadena nueva: traducirla en app-i18n.ts (valor idéntico si no cambia).

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...tsx(p)); }
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("catalán · cobertura de la app gestor", () => {
  it("toda cadena literal pasada a t() tiene traducción en CA", () => {
    const faltan: string[] = [];
    for (const f of [...tsx("app"), ...tsx("components")]) {
      const s = readFileSync(f, "utf8");
      // Perímetro: el t() del app gestor — no el del portal cliente (portal-i18n).
      if (!s.includes("lang-provider") && !s.includes("app-lang")) continue;
      for (const m of s.matchAll(/\bt\(([^()]{1,400}?)\)/g)) {
        for (const lit of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          // El regex lee el FUENTE: «\n» son dos caracteres. En el objeto CA importado
          // son un salto de línea real — se desescapa antes de comparar.
          let clave = lit[1];
          try { clave = JSON.parse(`"${lit[1]}"`); } catch { /* literal con escapes no-JSON: tal cual */ }
          if (clave.trim() && !(clave in CA)) faltan.push(`${f} → «${clave.slice(0, 70)}»`);
        }
      }
    }
    expect([...new Set(faltan)]).toEqual([]);
  });

  it("los valores dinámicos que pasan por t(variable) tienen traducción", () => {
    // El extractor de literales no ve t(a.evento) ni t(p.para): las FUENTES de esos
    // valores se declaran aquí. Visto el 01/09: «Documento recibido» en castellano
    // en plena pantalla catalana de Notificacions.
    const dinamicos = [
      ...DEFAULT_AVISOS.map((a) => a.evento),
      ...Object.values(PLANES).map((p) => p.para),
      ...Object.values(ROLES).flatMap((r) => [r.label, r.desc]),
      ...TIPOS.flatMap((tp) => [tp.label, tp.desc]),
      ...FICHA_CAMPOS.map((c) => c.label),
      ...GRUPOS,
      // labels de los modales de tasa (arrays locales al componente)
      ...["components/tasa790-modal.tsx", "components/tasa790026-modal.tsx"].flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/label: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])),
    ];
    const faltan = [...new Set(dinamicos)].filter((v) => v && !(v in CA));
    expect(faltan).toEqual([]);
  });

  it("los placeholders {x} de cada traducción coinciden con los de su clave", () => {
    const mal = Object.entries(CA)
      .map(([k, v]) => [k, v, JSON.stringify([...k.matchAll(/\{[a-z]+\}/gi)].map((m) => m[0]).sort()), JSON.stringify([...v.matchAll(/\{[a-z]+\}/gi)].map((m) => m[0]).sort())] as const)
      .filter(([, , a, b]) => a !== b)
      .map(([k]) => k);
    expect(mal).toEqual([]);
  });
});
