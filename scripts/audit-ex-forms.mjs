// Audit automatique des formulaires officiels : remplit chaque modèle avec des sentinelles,
// extrait les positions du texte (pdfjs) et vérifie que chaque valeur est sur la ligne de
// son libellé (|dy| <= 6) et à sa droite (0 < dx < 420).
import { rellenarOficial, formulariosOficiales } from "../lib/ex-forms.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const S = {
  pasaporte: "VPASS", nie1: "Q", nie2: "NIENUM", nie3: "W",
  apellido1: "VAPE1", apellido2: "VAPE2", nombre: "VNOMB", sexo: "M", estadoCivil: "D",
  fechaD: "DD", fechaM: "MM", fechaA: "AAAA",
  lugarNac: "VLUGAR", paisNac: "VPAIS", nacionalidad: "VNACION",
  nombrePadre: "VPADRE", nombreMadre: "VMADRE",
  domicilio: "VDOMIC", numero: "NN", piso: "PZ", localidad: "VLOCAL", cp: "CPCPC", provincia: "VPROVIN",
  telefono: "VTELEF", email: "VEMAIL",
};
const S2 = { ...S,
  pasaporte: "RPASS", nie1: "J", nie2: "RNIENUM", nie3: "K", apellido1: "RAPE1", apellido2: "RAPE2",
  nombre: "RNOMB", sexo: "H", estadoCivil: "C", fechaD: "EE", fechaM: "FF", fechaA: "BBBB",
  lugarNac: "RLUGAR", paisNac: "RPAIS", nacionalidad: "RNACION", nombrePadre: "RPADRE", nombreMadre: "RMADRE",
  domicilio: "RDOMIC", numero: "RR", piso: "PY", localidad: "RLOCAL", cp: "CQCQC", provincia: "RPROVIN",
  telefono: "RTELEF", email: "REMAIL",
};

const LABELS = {
  pasaporte: ["PASAPORTE"], nie1: ["N.I.E."], nie2: ["N.I.E."], nie3: ["N.I.E."],
  apellido1: ["1er Apellido"], apellido2: ["2º Apellido"], nombre: ["Nombre"],
  fechaD: ["Fecha de nacimiento"], fechaM: ["Fecha de nacimiento"], fechaA: ["Fecha de nacimiento"],
  lugarNac: ["Lugar"], paisNac: ["País"], nacionalidad: ["Nacionalidad"],
  nombrePadre: ["Nombre del padre"], nombreMadre: ["Nombre de la madre"],
  domicilio: ["Domicilio en España", "Domicilio de residencia"], numero: ["Nº"], piso: ["Piso"],
  localidad: ["Localidad"], cp: ["C.P."], provincia: ["Provincia"],
  telefono: [/^Teléfono/], email: [/mail/i],
};

async function textItems(bytes, pageNum) {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  if (pageNum > doc.numPages) return [];
  const page = await doc.getPage(pageNum);
  const tc = await page.getTextContent();
  return tc.items.map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) })).filter((i) => i.s);
}
const match = (s, l) => (typeof l === "string" ? s === l : l.test(s));

function auditValues(tag, vals, filled, fails, skip = []) {
  for (const [k, labels] of Object.entries(LABELS)) {
    if (skip.includes(k)) continue;
    const v = vals[k];
    if (!v || k === "sexo" || k === "estadoCivil") continue;
    const hit = filled.find((i) => i.s === v);
    if (!hit) { fails.push(`${tag} ${k}: VALEUR "${v}" INTROUVABLE`); continue; }
    // Exclure les sentinelles elles-mêmes (p. ej. "VEMAIL" matche /mail/i) des candidats-libellés.
    const sentinelas = new Set(Object.values(vals));
    const cands = filled.filter((i) => !sentinelas.has(i.s) && labels.some((l) => match(i.s, l)));
    if (!cands.length) { fails.push(`${tag} ${k}: LABEL introuvable`); continue; }
    const lab = cands.reduce((a, b) => (Math.abs(a.y - hit.y) <= Math.abs(b.y - hit.y) ? a : b));
    const dy = hit.y - lab.y, dx = hit.x - lab.x;
    if (Math.abs(dy) > 6) fails.push(`${tag} ${k}: dy=${dy} (val y=${hit.y} vs label "${lab.s}" y=${lab.y})`);
    else if (dx <= 0 || dx > 460) fails.push(`${tag} ${k}: dx=${dx} (val x=${hit.x} vs label x=${lab.x})`);
  }
}
function auditMark(tag, sexo, ec, blank, filled, fails) {
  // X estampillés = items "X" du rempli absents du vierge (à ±2px)
  const nuevos = filled.filter((i) => i.s === "X" && !blank.some((b) => b.s === "X" && Math.abs(b.x - i.x) <= 2 && Math.abs(b.y - i.y) <= 2));
  const near = (labelStr, x) => {
    const cands = blank.filter((b) => b.s === labelStr);
    if (!cands.length) return false;
    const lab = cands.reduce((a, b) => (Math.abs(a.y - x.y) <= Math.abs(b.y - x.y) ? a : b));
    return Math.abs(x.y - lab.y) <= 6 && x.x > lab.x && x.x - lab.x <= 30;
  };
  if (!nuevos.some((x) => near(sexo, x))) fails.push(`${tag} sexo(${sexo}): marque X absente/décalée`);
  if (!nuevos.some((x) => near(ec, x))) fails.push(`${tag} estadoCivil(${ec}): marque X absente/décalée`);
}

const { readFile } = await import("node:fs/promises");
let totalFails = 0;
for (const code of formulariosOficiales()) {
  if (code === "EX-10") continue; // acroform → audité à part
  const fails = [];
  const blankBytes = new Uint8Array(await readFile(`forms/ex/${code}.pdf`));
  const blank = await textItems(blankBytes, 1);
  const extra = code === "EX-02" ? { reagrupado: S2, menorRepresentado: true }
    : (code === "EX-31" || code === "EX-32") ? { padreTutor: S2 } : undefined;
  const out = await rellenarOficial(code, S, undefined, extra);
  if (!out) { console.log(`${code}: NULL`); continue; }
  const filled = await textItems(new Uint8Array(out), 1);
  auditValues(code, S, filled, fails);
  auditMark(code, "M", "D", blank, filled, fails);
  if (code === "EX-02" && extra) {
    // Le bloc reagrupado du EX-02 officiel n'a pas de ligne teléfono/email → non estampillés.
    auditValues(`${code}[reagrupado]`, S2, filled, fails, ["telefono", "email"]);
    auditMark(`${code}[reagrupado]`, "H", "C", blank, filled, fails);
    const p2 = await textItems(new Uint8Array(out), 2);
    const p2blank = await textItems(blankBytes, 2);
    const marks = p2.filter((i) => i.s === "X" && !p2blank.some((b) => b.s === "X" && Math.abs(b.x - i.x) <= 2 && Math.abs(b.y - i.y) <= 2));
    if (!marks.some((m) => Math.abs(m.y - 662) <= 6 && Math.abs(m.x - 240) <= 8)) fails.push(`${code}: case menor p.2 absente`);
  }
  if ((code === "EX-31" || code === "EX-32") && extra) {
    // Bloc p.2 "EN EL CASO DE MENORES": identité du padre/tutor (pas de domicilio/contact).
    const p2 = await textItems(new Uint8Array(out), 2);
    const p2blank = await textItems(blankBytes, 2);
    auditValues(`${code}[menor-p2]`, S2, p2, fails, ["domicilio", "numero", "piso", "localidad", "cp", "provincia", "telefono", "email"]);
    auditMark(`${code}[menor-p2]`, "H", "C", p2blank, p2, fails);
  }
  console.log(fails.length ? `❌ ${code}: ${fails.length} problème(s)` : `✅ ${code}: OK`);
  fails.forEach((f) => console.log(`   ${f}`));
  totalFails += fails.length;
}
// EX-10 acroform: relire les champs remplis
{
  const { PDFDocument } = await import("pdf-lib");
  const out = await rellenarOficial("EX-10", S, "ARRAIGO_SOCIAL");
  const fails = [];
  if (out) {
    const pdf = await PDFDocument.load(out, { ignoreEncryption: true });
    const form = pdf.getForm();
    const { FORMS } = await import("../lib/ex-forms.ts");
    const mapa = FORMS["EX-10"];
    for (const [k, fieldName] of Object.entries(mapa.texto)) {
      const v = S[k];
      if (!v) continue;
      try { const got = form.getTextField(fieldName).getText(); if (got !== v) fails.push(`EX-10 ${k}: "${got}" != "${v}"`); }
      catch { fails.push(`EX-10 ${k}: champ "${fieldName}" absent`); }
    }
    const cb = (n, want, tag) => { try { if (form.getCheckBox(n).isChecked() !== want) fails.push(`EX-10 ${tag}: case ${n} != ${want}`); } catch { fails.push(`EX-10 ${tag}: case ${n} absente`); } };
    cb(mapa.checks.sexoM, true, "sexo M"); cb(mapa.checks.sexoH, false, "sexo H");
    cb(mapa.estadoCivil.D, true, "estadoCivil D");
    for (const n of mapa.tramiteChecks.ARRAIGO_SOCIAL) cb(n, true, "tramite");
  } else fails.push("EX-10: NULL");
  console.log(fails.length ? `❌ EX-10: ${fails.length} problème(s)` : `✅ EX-10: OK`);
  fails.forEach((f) => console.log(`   ${f}`));
  totalFails += fails.length;
}
// ── Page 2 «DATOS RELATIVOS A LA SOLICITUD»: casillas de trámite (TRAMITE_P2) ──
// Géométrie inversée vs page 1: le glifo □ PRÉCÈDE le libellé → la X doit être
// 4..14pt à GAUCHE du libellé, sur sa ligne (|dy| <= 6).
{
  const CASOS = [
    ["EX-17", "TIE", "TARJETA INICIAL"],
    ["EX-17", "RENOVACION", "RENOVACIÓN DE TARJETA"],
    ["EX-17", "DUPLICADO", "DUPLICADO POR PÉRDIDA, SUSTRACCIÓN, DETERIORO O CAMBIO DE DATOS"],
    ["EX-15", "NIE", "NÚMERO DE IDENTIDAD DE EXTRANJERO (NIE)"],
  ];
  for (const [code, tramite, label] of CASOS) {
    const fails = [];
    const blankBytes = new Uint8Array(await readFile(`forms/ex/${code}.pdf`));
    const p2blank = await textItems(blankBytes, 2);
    const out = await rellenarOficial(code, S, tramite);
    const p2 = await textItems(new Uint8Array(out), 2);
    const marks = p2.filter((i) => i.s === "X" && !p2blank.some((b) => b.s === "X" && Math.abs(b.x - i.x) <= 2 && Math.abs(b.y - i.y) <= 2));
    const lab = p2blank.find((b) => b.s === label);
    if (!lab) fails.push(`${code}[p2 ${tramite}]: libellé "${label}" introuvable dans le vierge`);
    else if (!marks.some((m) => Math.abs(m.y - lab.y) <= 6 && lab.x - m.x >= 4 && lab.x - m.x <= 14)) {
      fails.push(`${code}[p2 ${tramite}]: X absente/décalée (attendue ~${lab.x - 9},${lab.y}; vues: ${marks.map((m) => `${m.x},${m.y}`).join(" · ") || "aucune"})`);
    }
    // Sans trámite: aucune X nouvelle en page 2.
    const sin = await rellenarOficial(code, S);
    const p2sin = await textItems(new Uint8Array(sin), 2);
    const sobran = p2sin.filter((i) => i.s === "X" && !p2blank.some((b) => b.s === "X" && Math.abs(b.x - i.x) <= 2 && Math.abs(b.y - i.y) <= 2));
    if (sobran.length) fails.push(`${code}[p2 sin trámite]: ${sobran.length} X inattendue(s)`);
    console.log(fails.length ? `❌ ${code}[p2 ${tramite}]: ${fails.length} problème(s)` : `✅ ${code}[p2 ${tramite}]: OK`);
    fails.forEach((f) => console.log(`   ${f}`));
    totalFails += fails.length;
  }
}
console.log(`\nTOTAL: ${totalFails} problème(s)`);
