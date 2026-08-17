import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
async function textos(ruta) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(ruta)), useSystemFonts: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const it of (await page.getTextContent()).items) { const s = it.str?.trim(); if (s) out.push(`p${p-1} ${Math.round(it.transform[4])},${Math.round(it.transform[5])} ${s}`); }
  }
  return out;
}
const [a, b] = [await textos(process.argv[2]), await textos(process.argv[3])];
const sa = new Set(a), sb = new Set(b);
const quitados = a.filter((x) => !sb.has(x)), nuevos = b.filter((x) => !sa.has(x));
console.log(`textos idénticos: ${a.length - quitados.length}/${a.length}`);
if (!quitados.length && !nuevos.length) console.log("✅ NINGÚN cambio de texto ni de posición.");
else {
  console.log(`\n— quitados (${quitados.length}) —`); quitados.slice(0, 15).forEach((x) => console.log("  - " + x));
  console.log(`\n— nuevos (${nuevos.length}) —`); nuevos.slice(0, 15).forEach((x) => console.log("  + " + x));
}
