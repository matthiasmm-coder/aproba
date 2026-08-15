// Suite e2e Aproba — rejouable, réversible, contre la prod (ws de test uniquement).
//
//   npm run e2e            → tous les scénarios
//   npm run e2e -- 02      → un seul (préfixe du fichier)
//
// Chaque scénario nettoie ses fixtures en finally (préfixe ZZE2E) et redescend
// le compteur UsoMensual. Voir scripts/e2e/_lib.mjs pour le socle.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const filtro = process.argv[2] ?? null;
const archivos = readdirSync(dir).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort()
  .filter((f) => !filtro || f.startsWith(filtro));

let ok = 0, total = 0, fallos = [];
for (const f of archivos) {
  const mod = await import(join(dir, f));
  console.log(`\n▶ ${mod.nombre}`);
  try {
    const r = await mod.run();
    ok += r.ok; total += r.total;
    if (r.ok < r.total) fallos.push(mod.nombre);
  } catch (e) {
    total += 1; fallos.push(`${mod.nombre} (crash: ${e.message})`);
    console.log(`  💥 ${e.message}`);
  }
}
console.log(`\n═══ e2e: ${ok}/${total}${fallos.length ? ` — ÉCHECS: ${fallos.join(" · ")}` : " — tout vert"} ═══`);
process.exitCode = ok === total ? 0 : 1;
