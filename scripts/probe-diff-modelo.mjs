// Compare les positions des libellés entre l'ancien modèle (en prod) et le nouveau
// officiel : si une ligne bouge, le mapping vec() de ce formulaire est à refaire.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

const ANCLAS = [/^PASAPORTE/i, /^Apellidos/i, /^Nombre$/i, /^Fecha de nacimiento/i, /^Nacionalidad/i,
                /^Estado civil/i, /^Domicilio/i, /^Localidad/i, /^Tel[eé]fono/i, /^Sexo/i];

async function mapa(ruta) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(ruta)), useSystemFonts: true }).promise;
  const out = { paginas: doc.numPages, items: [] };
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const it of (await page.getTextContent()).items) {
      const s = it.str?.trim(); if (!s) continue;
      out.items.push({ s, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), page: p - 1 });
    }
  }
  return out;
}
const [viejo, nuevo] = [await mapa(process.argv[2]), await mapa(process.argv[3])];
console.log(`páginas: ${viejo.paginas} → ${nuevo.paginas}${viejo.paginas !== nuevo.paginas ? "  ⚠️ CAMBIÓ" : ""}`);
console.log(`textos:  ${viejo.items.length} → ${nuevo.items.length}\n`);
for (const rx of ANCLAS) {
  const a = viejo.items.find((t) => rx.test(t.s) && t.page === 0);
  const b = nuevo.items.find((t) => rx.test(t.s) && t.page === 0);
  if (!a && !b) { console.log(`   ${rx} : absent des deux`); continue; }
  if (!a || !b) { console.log(`⚠️  ${rx} : ${a ? "sólo en el VIEJO" : "sólo en el NUEVO"}`); continue; }
  const dx = b.x - a.x, dy = b.y - a.y;
  console.log(`${dx || dy ? "⚠️ " : "✅"} ${a.s.slice(0, 26).padEnd(26)} viejo(${a.x},${a.y}) → nuevo(${b.x},${b.y})  dx=${dx} dy=${dy}`);
}
// libellés estado civil (S C V D Sp)
const linea = (m) => { const anc = m.items.find((t) => /estado\s*civil/i.test(t.s) && t.page === 0); return anc ? m.items.filter((t) => t.page === 0 && Math.abs(t.y - anc.y) <= 6 && ["S","C","V","D","Sp"].includes(t.s)).map((t) => `${t.s}@${t.x}`).join(" ") : "—"; };
console.log(`\nestado civil viejo: ${linea(viejo)}`);
console.log(`estado civil nuevo: ${linea(nuevo)}`);
