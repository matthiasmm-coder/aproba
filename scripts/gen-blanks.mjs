// Genera forms/ex/blanks.json: los campos VACÍOS genéricos del modo editable, para TODOS los
// modelos overlay — casillas (glifo □), conduites de las filas (glifo «espacio» ancho, partido
// por los rótulos de la fila) y tramos de puntos («………», dentro o fuera de un rótulo).
//   node scripts/gen-blanks.mjs            → reescribe forms/ex/blanks.json
//   node scripts/gen-blanks.mjs --check    → compara con los blanks calibrados a mano (EX-15/17/18)
// Reglas medidas contra la calibración manual (02/09/2026, Juan):
//   • fila = línea base con ≥1 conduite; tramo = del fin de un rótulo (+4,5) al inicio del
//     siguiente (−5,5); el último llega al borde del marco (545). Las filas Sexo / Estado civil
//     se saltan (sus casillas las pone vec()).
//   • puntos: base del texto = y del ítem + 2,9 (la tinta del «…» queda 1 pt sobre su base).
//   • conduite espacio: base del texto = y del ítem − 1,9 (tinta 4-5 pt bajo la base), como
//     las filas de la sección 1.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const helv = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
const r1 = (v) => Math.round(v * 10) / 10;
const ACROFORM = new Set(["EX-10", "EX-25"]);
const BORDE = 545;
const FILAS_SIN = /^(Sexo|Estado civil|X\s*\*?|H|M|S|C|V|D|Sp)$|^X\(\*\)/;

async function blanksDe(code) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(`forms/ex/${code}.pdf`)), useSystemFonts: true }).promise;
  const c = [], t = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items.filter((i) => i.str !== "" && i.width !== undefined);
    const pg = p - 1;
    const rotulos = [], conduites = [];
    for (const it of items) {
      const s = it.str, x = it.transform[4], y = it.transform[5], w = it.width;
      const size = Math.hypot(it.transform[0], it.transform[1]);
      if (s === "□") { c.push([pg, r1(x), r1(y)]); continue; }
      if (/^ +$/.test(s)) { if (w >= 12) conduites.push({ x, y, w }); continue; }
      if (!s.trim()) continue;
      // Tramos de puntos («…»): dentro de un rótulo (medidos con Helvetica escalada) o solos.
      if (/[.…]{3,}/.test(s)) {
        const wH = (txt) => helv.widthOfTextAtSize(txt.replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "."), size);
        const esc = w / (wH(s) || 1);
        const solo = /^[.…·/, a-z]+$/.test(s); // «………, a … de … de …» / «…../…../……»
        for (const m of s.matchAll(/[.…]{2,}/g)) {
          const x0 = x + wH(s.slice(0, m.index)) * esc, ww = wH(m[0]) * esc;
          if (ww < 8) continue;
          t.push([pg, r1(solo ? x0 : x0 + 4), r1(y + 2.9), r1(Math.max(14, solo ? ww : ww - 8))]);
        }
        rotulos.push({ s, x, y, x2: x + w });
        continue;
      }
      rotulos.push({ s: s.trim(), x, y, x2: x + w });
    }
    // Filas con conduite: tramos entre rótulos. Para PARTIR la fila cuentan también los
    // rótulos a ±6 pt de la base (superíndices «(4)», rótulos de una línea vecina desplazada
    // 2-3 pt como «Lugar» junto a «Fecha de nacimiento»): el test de solape los vigila.
    const filas = new Map();
    for (const cd of conduites) { const k = Math.round(cd.y); if (!filas.has(k)) filas.set(k, cd.y); }
    for (const [, y] of filas) {
      const labs = rotulos.filter((r) => Math.abs(r.y - y) < 6).sort((a, b) => a.x - b.x);
      if (!labs.length || labs.some((r) => FILAS_SIN.test(r.s))) continue;
      for (let i = 0; i < labs.length; i++) {
        const a = labs[i].x2 + 4.5;
        const b = (i + 1 < labs.length ? labs[i + 1].x - 5.5 : BORDE);
        if (b - a < 14) continue;
        t.push([pg, r1(a), r1(y - 1.9), r1(b - a)]);
      }
    }
  }
  // Autocomprobación con el criterio de lib/ex-forms-solape.test.ts: ningún tramo puede
  // tapar una PALABRA impresa (los puntos y el «□» no cuentan). Si un tramo la toca, se
  // recorta hasta la palabra; si queda estrecho (< 14), se descarta.
  const esRelleno = (ch) => /[.…_·\s□☐▯-]/.test(ch);
  const medible = (x) => x.replace(/[□☐▯]/g, "H").replace(/[^\u0000-\u00ff\u2026\u2018-\u201d\u20ac]/g, " ");
  const palabras = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const i of (await page.getTextContent()).items) {
      const s = i.str ?? ""; const anchoReal = i.width ?? 0;
      if (!s.trim() || anchoReal <= 0) continue;
      const m = medible(s); let bruto = 0;
      try { bruto = helv.widthOfTextAtSize(m, 100); } catch { continue; }
      if (bruto <= 0) continue;
      const talla = (anchoReal / bruto) * 100, x0 = i.transform[4];
      let ini = -1;
      for (let k = 0; k <= s.length; k++) {
        const dentro = k < s.length && !esRelleno(s[k]);
        if (dentro && ini < 0) ini = k;
        if (!dentro && ini >= 0) {
          const tramo = s.slice(ini, k);
          if (tramo !== "/") palabras.push({ p: p - 1, x: x0 + helv.widthOfTextAtSize(m.slice(0, ini), talla), x2: x0 + helv.widthOfTextAtSize(m.slice(0, k), talla), y: i.transform[5] });
          ini = -1;
        }
      }
    }
  }
  const tOk = [];
  for (const [pg, x, y, w] of t) {
    // Caja del campo en el PDF: y − CAJA_DY, alto 14 → centro y + 3 ; misma línea si |Δ| ≤ 5.
    let a = x, b = x + w;
    for (const pal of palabras) {
      if (pal.p !== pg || Math.abs((y - 4 + 7) - (pal.y + 3)) > 5) continue;
      if (Math.min(b, pal.x2) - Math.max(a, pal.x) <= 1.5) continue;
      if (pal.x <= a + 2) a = Math.max(a, pal.x2 + 2); else b = Math.min(b, pal.x - 2);
    }
    if (b - a >= 14) tOk.push([pg, r1(a), y, r1(b - a)]);
  }
  return { c, t: tOk };
}

const codes = readdirSync("forms/ex").filter((f) => /^EX-\d\d\.pdf$/.test(f)).map((f) => f.slice(0, 5)).filter((c) => !ACROFORM.has(c)).sort();
const out = {};
for (const code of codes) { out[code] = await blanksDe(code); console.log(`${code}: ${out[code].c.length} casillas · ${out[code].t.length} tramos`); }
if (process.argv.includes("--check")) {
  // Blanks calibrados a mano de lib/ex-forms.ts (P1_BLANKS/P2_BLANKS): ¿cada uno tiene su equivalente genérico?
  const src = readFileSync("lib/ex-forms.ts", "utf8");
  const CAJA_DY = 4;
  const t1 = (name, x, y, w) => ({ name, x, y, w, page: 0 });
  const t2 = (name, x, y, w) => ({ name, x, y, w, page: 1 });
  const caja = (name, gx, gy) => ({ name, gx, gy, page: 1, centrar: true });
  const grab = (nombre) => { const i = src.indexOf(`const ${nombre}: Record<string, Blank[]> = {`); const j = src.indexOf("\n};", i); return new Function("t1", "t2", "caja", "CAJA_DY", "return " + src.slice(i + `const ${nombre}: Record<string, Blank[]> = `.length, j + 2))(t1, t2, caja, CAJA_DY); };
  const P = { ...grab("P1_BLANKS") }; for (const [k, v] of Object.entries(grab("P2_BLANKS"))) P[k] = [...(P[k] ?? []), ...v];
  for (const [code, lista] of Object.entries(P)) {
    let ok = 0; const malos = [];
    for (const e of lista) {
      const hit = e.centrar ? out[code].c.some(([p, gx, gy]) => p === e.page && Math.abs(gx - e.gx) < 1 && Math.abs(gy - e.gy) < 1)
        : out[code].t.some(([p, x, y, w]) => p === e.page && Math.abs(x - e.x) < 8 && Math.abs(y - e.y) < 1.5 && Math.abs(w - e.w) < 30);
      if (hit) ok++; else malos.push(`${e.name}(p${e.page} ${e.gx ?? e.x},${e.gy ?? e.y}${e.w ? "+" + e.w : ""})`);
    }
    console.log(`  ${code}: ${ok}/${lista.length} calibrados reproducidos${malos.length ? " · sin equivalente: " + malos.join(" ") : ""}`);
  }
} else {
  writeFileSync("forms/ex/blanks.json", JSON.stringify(out) + "\n");
  console.log("→ forms/ex/blanks.json");
}
