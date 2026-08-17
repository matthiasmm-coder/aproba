import { rellenarOficial } from "../lib/ex-forms.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const bytes = await rellenarOficial("EX-01", {});
const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const c = await page.getTextContent();
const items = c.items.filter(i => i.str.trim()).map(i => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));
const ec = items.find(i => /estado\s*civil/i.test(i.s));
console.log("Ancre « Estado civil » :", JSON.stringify(ec));
if (ec) {
  console.log("\nTout ce qui est sur cette ligne (±8 px) :");
  for (const i of items.filter(i => Math.abs(i.y - ec.y) <= 8).sort((a,b)=>a.x-b.x)) console.log(`  x=${i.x} y=${i.y}  "${i.s}"`);
}
