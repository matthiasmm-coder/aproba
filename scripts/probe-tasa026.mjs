// Probe visuel de la tasa 790-026 : télécharge un ejemplar officiel FRAIS de la Sede
// de Justicia, le remplit avec des données de démonstration, écrit le PDF + un PNG
// par page utile. À lancer avant tout changement du mapping :
//   node --loader ./scripts/ts-loader.mjs scripts/probe-tasa026.mjs [dossierSortie]
import { descargarPlantilla026, rellenarTasa026 } from "../lib/tasa790026.ts";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const out = process.argv[2] ?? ".";
const plantilla = await descargarPlantilla026();
console.log(`plantilla oficial: ${plantilla.length} octets`);

const buf = await rellenarTasa026(plantilla, {
  tipoDoc: "nie",
  numId: "Z1234567R",
  apellido1: "GARCÍA", apellido2: "PÉREZ", nombre: "MARÍA",
  domicilio: "CALLE MALLORCA", numero: "245", piso: "3º2ª",
  municipio: "BARCELONA", provincia: "BARCELONA", pais: "España", cp: "08013",
  fechaNac: "07/03/1990",
  telefono: "+34612345678", email: "maria@example.com",
  presNumId: "48123456B", presNombre: "JUAN GESTOR LÓPEZ",
  importe: "104,05",
  firmaLugar: "Barcelona", firmaFecha: "28/08/2026",
});

const pdf = path.join(out, "probe-tasa026.pdf");
await writeFile(pdf, buf);
console.log(`rellenada: ${pdf} (${buf.length} octets)`);
for (const p of [1, 2]) {
  const png = path.join(out, `probe-tasa026-p${p}.png`);
  // sips ne pagine pas : on extrait la página con pdf-lib… más simple: qlmanage no.
  // macOS: `sips` rasteriza SOLO la primera página → páginas via pdftoppm si existe,
  // si no, una sola imagen de la página 1 (suficiente: las 3 copias son idénticas).
  try {
    execFileSync("pdftoppm", ["-f", String(p), "-l", String(p), "-r", "120", "-png", "-singlefile", pdf, png.replace(/\.png$/, "")]);
    console.log(`página ${p} → ${png}`);
  } catch {
    if (p === 1) {
      execFileSync("sips", ["-s", "format", "png", "--resampleHeight", "1600", pdf, "--out", png], { stdio: "ignore" });
      console.log(`página 1 (sips) → ${png}`);
    }
  }
}
