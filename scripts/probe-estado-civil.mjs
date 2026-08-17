// Probe : la croix « estado civil » tombe-t-elle sur sa case ?
// Les libellés du PDF sont « S C V D Sp » sur la ligne « Estado civil ».
// On compare le PDF rempli au PDF vide : la croix ajoutée doit être JUSTE à
// droite (dx 6..24) du libellé de la valeur, sur la même ligne (|dy| <= 6).
import { rellenarOficial, formulariosOficiales } from "../lib/ex-forms.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const BASE = {
  pasaporte: "PASS", nie1: "Q", nie2: "NIE", nie3: "W",
  apellido1: "APE1", apellido2: "APE2", nombre: "NOMB",
  fechaD: "01", fechaM: "02", fechaA: "1990",
  lugarNac: "LUGAR", paisNac: "PAIS", nacionalidad: "NACION",
  nombrePadre: "PADRE", nombreMadre: "MADRE",
  domicilio: "DOMIC", numero: "1", piso: "2", localidad: "LOCAL", cp: "08001", provincia: "PROV",
  telefono: "600", email: "a@b.c",
};

async function textos(bytes) {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const it of (await page.getTextContent()).items) {
      if (!it.str?.trim()) continue;
      out.push({ s: it.str.trim(), x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), page: p - 1 });
    }
  }
  return out;
}

let ok = 0, ko = 0;
for (const code of formulariosOficiales()) {
  const vacio = await textos(await rellenarOficial(code, { ...BASE }));
  const anclas = vacio.filter((t) => /estado\s*civil/i.test(t.s));
  if (!anclas.length) { console.log(`⚠️  ${code}: pas d'ancre « Estado civil » (acroform ?)`); continue; }
  const anc = anclas[0];
  const linea = vacio.filter((t) => t.page === anc.page && Math.abs(t.y - anc.y) <= 6 && t.x > anc.x);
  const lab = {};
  for (const v of ["S", "C", "V", "D", "Sp"]) { const m = linea.find((t) => t.s === v); if (m) lab[v] = m; }

  for (const valor of ["S", "C"]) {
    if (!lab[valor]) { console.log(`⚠️  ${code} ${valor}: libellé « ${valor} » absent de la ligne`); continue; }
    const lleno = await textos(await rellenarOficial(code, { ...BASE, estadoCivil: valor }));
    const clef = (t) => `${t.s}@${t.x},${t.y},${t.page}`;
    const antes = new Set(vacio.map(clef));
    const cruces = lleno.filter((t) => !antes.has(clef(t)) && /^X$/i.test(t.s));
    if (!cruces.length) { console.log(`❌ ${code} ${valor}: AUCUNE croix`); ko++; continue; }
    const cerca = cruces.map((n) => ({ n, d: Math.hypot(n.x - lab[valor].x, n.y - lab[valor].y) })).sort((a, b) => a.d - b.d)[0].n;
    const dx = cerca.x - lab[valor].x, dy = cerca.y - lab[valor].y;
    const bien = Math.abs(dy) <= 6 && dx >= 5 && dx <= 26 && cerca.page === lab[valor].page;
    // La croix ne doit pas non plus être plus proche d'un AUTRE libellé (décalage d'un cran)
    const otro = Object.entries(lab).filter(([k]) => k !== valor)
      .map(([k, t]) => ({ k, d: Math.hypot(cerca.x - t.x, cerca.y - t.y) })).sort((a, b) => a.d - b.d)[0];
    const confus = otro && otro.d < Math.hypot(dx, dy);
    console.log(`${bien && !confus ? "✅" : "❌"} ${code} ${valor}: croix dx=${dx} dy=${dy}${confus ? ` ⚠️ PLUS PROCHE de « ${otro.k} »` : ""}`);
    bien && !confus ? ok++ : ko++;
  }
}
console.log(`\n${ok} OK · ${ko} KO`);
