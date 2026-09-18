// Empareja cada campo AcroForm de un PDF con el rótulo IMPRESO más cercano (a la
// izquierda, encima o a la derecha). Sirve para mapear impresos cuyos campos tienen
// nombres opacos —«Texto39», «Casilla de verificación14»—, que es el caso de los
// modelos de la Ley 14/2013 (MI-T, MI-TIE, MI-F) y de la EX-25.
//   node --loader ./scripts/ts-loader.mjs scripts/probe-campos-acroform.mjs ruta.pdf [página]
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const ruta = process.argv[2], pagPedida = Number(process.argv[3] ?? 1);
const bytes = readFileSync(ruta);
const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = pdf.getPages(); const form = pdf.getForm();
const page = await doc.getPage(pagPedida);
const textos = (await page.getTextContent()).items.filter((i) => i.str?.trim()).map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width ?? 0 }));
const campos = [];
for (const f of form.getFields()) for (const w of f.acroField.getWidgets()) {
  const pi = pages.findIndex((p) => p.ref === w.P());
  if (pi !== pagPedida - 1) continue;
  const r = w.getRectangle();
  campos.push({ n: f.getName(), t: f.constructor.name.includes("CheckBox") ? "☐" : "▭", x: r.x, y: r.y, w: r.width, h: r.height });
}
campos.sort((a, b) => b.y - a.y || a.x - b.x);
for (const c of campos) {
  const cy = c.y + c.h / 2;
  const izq = textos.filter((t) => Math.abs(t.y + 3 - cy) < 7 && t.x + t.w <= c.x + 2).sort((a, b) => b.x - a.x)[0];
  const arr = textos.filter((t) => t.y > c.y + c.h - 2 && t.y < c.y + c.h + 14 && t.x < c.x + c.w && t.x + t.w > c.x - 40).sort((a, b) => a.y - b.y || Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
  const der = textos.filter((t) => Math.abs(t.y + 3 - cy) < 7 && t.x >= c.x + c.w - 2).sort((a, b) => a.x - b.x)[0];
  console.log(`${c.t} ${c.n.padEnd(26)} y=${Math.round(c.y)} x=${Math.round(c.x)} w=${Math.round(c.w)}`);
  console.log(`     ←"${(izq?.s ?? "").slice(0, 60)}"  ↑"${(arr?.s ?? "").slice(0, 60)}"  →"${(der?.s ?? "").slice(0, 45)}"`);
}
