// Deriva la línea vec() de un modelo EX overlay a partir del propio PDF oficial — sin
// calibrar a ojo. Así se mapearon los 11 modelos añadidos el 08/09/2026:
//   • filas (t): base pdfjs de los rótulos de la sección 1 con los offsets medidos sobre los
//     12 modelos calibrados a mano antes (|Δ| ≤ 0,3 pt);
//   • cuadrados Sexo / Estado civil (marcas, marcasY): rectángulos VECTORIALES de la operator
//     list de pdfjs (dos verticales a 10-17 pt unidas por horizontales), |Δ| ≤ 0,5 pt frente a
//     las medidas al ráster;
//   • tramos N.I.E.: fin del rótulo + separadores «-» impresos.
// Uso: node scripts/derivar-vec.mjs EX-19 EX-24 …  → pegar la línea en FORMS (lib/ex-forms.ts)
// y, si el modelo es de la familia EX-02 («2º Apellido» a 292), añadir sus limites/ajustes.
// Después: npm run audit:forms + vitest (ex-forms, ex-forms-solape) + regen-fingerprint.
import { readFileSync } from "node:fs";
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const r1 = (v) => Math.round(v * 10) / 10;
const RX = { P: /^PASAPORTE/i, NIE: /^N\.?I\.?E\.?$/i, A: /^(1er\s*)?Apellidos?$|^1º Apellido/i, A2: /^2º Apellido/i, N: /^Nombre$/i, X: /^X\s*\*?$|^X\(\*\)/, H: /^H$/, M: /^M$/, LUG: /^Lugar/i, NAC: /^Nacionalidad/i, S: /^S$/, C: /^C$/, V: /^V$/, D: /^D$/, SP: /^Sp$/, PADRE: /^Nombre del padre/i, MADRE: /^Nombre de la madre/i, DOM: /^Domicilio/i, NUM: /^N[ºo]\.?$/, PISO: /^Piso/i, LOC: /^Localidad/i, TEL: /^Tel[eé]fono/i };
function segmentos(opList) {
  const segs = []; let ctm = [1, 0, 0, 1, 0, 0]; const pila = [];
  const ap = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  const flush = (sub) => { for (let i = 1; i < sub.length; i++) segs.push({ x1: sub[i - 1][0], y1: sub[i - 1][1], x2: sub[i][0], y2: sub[i][1] }); if (sub.length >= 4) segs.push({ x1: sub[sub.length - 1][0], y1: sub[sub.length - 1][1], x2: sub[0][0], y2: sub[0][1] }); };
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i], a = opList.argsArray[i];
    if (fn === OPS.save) pila.push(ctm); else if (fn === OPS.restore) ctm = pila.pop() ?? ctm; else if (fn === OPS.transform) ctm = mul(a, ctm);
    else if (fn === OPS.constructPath) { const d = a[1][0]; let k = 0, sub = []; while (k < d.length) { const c = d[k]; if (c === 0) { flush(sub); sub = [ap(d[k + 1], d[k + 2])]; k += 3; } else if (c === 1) { sub.push(ap(d[k + 1], d[k + 2])); k += 3; } else if (c === 2) { sub.push(ap(d[k + 5], d[k + 6])); k += 7; } else if (c === 3) { sub.push(ap(d[k + 3], d[k + 4])); k += 5; } else if (c === 4) { flush(sub); sub = []; k += 1; } else break; } flush(sub); }
  }
  return segs;
}
function cajasEnBanda(segs, yc) {
  const v = segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.6 && Math.abs(s.y1 - s.y2) >= 8 && Math.abs(s.y1 - s.y2) <= 18 && Math.abs((s.y1 + s.y2) / 2 - yc) < 8).map((s) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2, h: Math.abs(s.y1 - s.y2) })).sort((a, b) => a.x - b.x);
  const hz = segs.filter((s) => Math.abs(s.y1 - s.y2) < 0.6 && Math.abs(s.x1 - s.x2) >= 9 && Math.abs(s.x1 - s.x2) <= 19 && Math.abs(s.y1 - yc) < 12).map((s) => ({ xa: Math.min(s.x1, s.x2), xb: Math.max(s.x1, s.x2), y: s.y1 }));
  const out = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { const dx = v[j].x - v[i].x; if (dx > 17) break; if (dx < 10 || Math.abs(v[j].y - v[i].y) > 2) continue; const bordes = hz.filter((h) => Math.abs(h.xa - v[i].x) < 1.2 && Math.abs(h.xb - v[j].x) < 1.2 && Math.abs(h.y - v[i].y) < v[i].h / 2 + 1.5); if (!bordes.length) continue; const c = { cx: r1((v[i].x + v[j].x) / 2), cy: r1((v[i].y + v[j].y) / 2) }; if (!out.some((o) => Math.abs(o.cx - c.cx) < 2)) out.push(c); }
  return out;
}
const EXTRAS = { "EX-28": "limites: { numeroX: 488, numeroW: 25, nombreW: 195 }, ajustes: { apellido1: { w: 175 }, apellido2: { x: 332, w: 220 } }, " };
for (const code of process.argv.slice(2)) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(`forms/ex/${code}.pdf`)), useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items.filter((i) => i.str?.trim()).map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width ?? 0 }));
  const L = Object.fromEntries(Object.keys(RX).map((k) => [k, items.find((i) => RX[k].test(i.s))]));
  const falta = Object.keys(RX).filter((k) => !L[k]); if (falta.length) { console.log(`// ${code}: faltan rótulos ${falta}`); }
  const t = { P: r1(L.P.y - 1.85), A: r1(L.A.y - 1.9), N: r1(L.N.y - 1.85), F: r1(L.LUG.y - 1.8), NAC: r1(L.NAC.y - 1.8), D: r1(L.DOM.y - 1.8), L: r1(L.LOC.y - 1.9), T: r1(L.TEL.y - 1.8) };
  const sx = [Math.round(L.X.y - 3), Math.round(L.X.x), Math.round(L.H.x), Math.round(L.M.x)];
  const ec = [Math.round(L.S.y), Math.round(L.S.x), Math.round(L.C.x), Math.round(L.V.x), Math.round(L.D.x), Math.round(L.SP.x)];
  const pm = [r1(L.PADRE.y - 1.9), Math.round(L.PADRE.x), Math.round(L.MADRE.x)];
  const seps = items.filter((i) => Math.abs(i.y - L.P.y) < 3 && i.x > L.NIE.x + 5 && /^-+$/.test(i.s)).sort((a, b) => a.x - b.x);
  const nie = [r1(L.NIE.x + L.NIE.w), r1(seps[0].x), r1(seps[0].x + seps[0].w), r1(seps[1].x), r1(seps[1].x + seps[1].w)];
  const segs = segmentos(await page.getOperatorList());
  const cs = cajasEnBanda(segs, L.X.y + 4), ce = cajasEnBanda(segs, L.S.y + 3);
  if (cs.length !== 3 || ce.length !== 5) console.log(`// ${code}: cajas anómalas sexo=${cs.length} ec=${ce.length}`);
  const ySexo = r1(cs.reduce((a, c) => a + c.cy, 0) / cs.length), yEc = r1(ce.reduce((a, c) => a + c.cy, 0) / ce.length);
  console.log(`  "${code}": vec({ P: ${t.P}, A: ${t.A}, N: ${t.N}, F: ${t.F}, NAC: ${t.NAC}, D: ${t.D}, L: ${t.L}, T: ${t.T} }, [${sx.join(", ")}], [${ec.join(", ")}], [${pm.join(", ")}], { nie: [${nie.join(", ")}], ${EXTRAS[code] ?? ""}marcas: { sexo: [${cs.map((c) => c.cx).join(", ")}], ec: [${ce.map((c) => c.cx).join(", ")}] }, marcasY: { sexo: ${ySexo}, ec: ${yEc} } }),`);
}
