// Vérifie que le nouveau diff() n'est pas devenu aveugle : 4 scénarios.
import { readFileSync } from "node:fs";
const src = readFileSync("scripts/veille-ex.mjs", "utf8");
const cuerpo = src.slice(src.indexOf("function diff("), src.indexOf("async function main()"));
const diff = new Function(`${cuerpo}; return diff;`)();

const item = (slug, sem, sha, extra = {}) => ({ slug, semantica: sem, sha256: sha, esPdf: true, textos: 456, paginas: 6, ...extra });
const casos = [
  ["re-export (mêmes textes, autres octets) → PAS d'alerte",
    { A: [item("/a", "SEM1", "bin1")] }, { A: [item("/a", "SEM1", "bin2")] }, 0],
  ["VRAI changement de modèle (textes déplacés) → ALERTE",
    { A: [item("/a", "SEM1", "bin1")] }, { A: [item("/a", "SEM2", "bin2", { textos: 461 })] }, 1],
  ["URL déplacée, contenu identique → PAS d'alerte",
    { A: [item("/a", "SEM1", "bin1")] }, { A: [item("/a-1", "SEM1", "bin1")] }, 0],
  ["modèle vraiment retiré → ALERTE",
    { A: [item("/a", "SEM1", "bin1")] }, { A: [] }, 1],
];
let ok = 0;
for (const [nom, base, cur, esperado] of casos) {
  const r = diff(base, cur);
  const bien = r.changes === esperado;
  console.log(`${bien ? "✅" : "❌"} ${nom} (changes=${r.changes}, esperado=${esperado})`);
  if (bien) ok++;
  if (!bien) console.log("   " + r.lines.join(" | "));
}
console.log(`\n${ok}/${casos.length}`);
process.exit(ok === casos.length ? 0 : 1);
