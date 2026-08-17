// Régénère l'empreinte d'un modèle EX dans forms/ex/fingerprints.json.
//   node --loader ./scripts/ts-loader.mjs scripts/regen-fingerprint.mjs EX-31
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const code = process.argv[2];
if (!code) { console.error("uso: regen-fingerprint.mjs EX-31"); process.exit(1); }
const ruta = `forms/ex/${code}.pdf`;
const buf = readFileSync(ruta);
const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const p1 = await doc.getPage(1);
const vp = p1.getViewport({ scale: 1 });
const fp = JSON.parse(readFileSync("forms/ex/fingerprints.json", "utf8"));
const antes = fp[code];
fp[code] = { sha256: createHash("sha256").update(buf).digest("hex"), paginas: doc.numPages, ancho: Math.round(vp.width), alto: Math.round(vp.height) };
writeFileSync("forms/ex/fingerprints.json", JSON.stringify(fp, null, 2) + "\n");
console.log(`${code}\n  antes: ${JSON.stringify(antes)}\n  ahora: ${JSON.stringify(fp[code])}`);
