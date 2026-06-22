// Veille proactive de los modelos EX oficiales.
//
// Toma una "foto" (slug → sha256) de los PDF oficiales del Ministerio para los modelos
// que Aproba mapea (los de forms/ex/fingerprints.json) y la compara con un baseline
// guardado (scripts/veille-ex-official.json). Si el Ministerio cambia un formulario
// (contenido, retira o añade un enlace) → exit 1 + reporte, para alertar y rehacer la
// plantilla / el mapeo en lib/ex-forms.ts.
//
//   node scripts/veille-ex.mjs          → compara contra el baseline (uso normal / CI)
//   node scripts/veille-ex.mjs --init   → (re)genera el baseline con el estado actual
//
// Nota: la plantilla del repo forms/ex/EX-10.pdf es una versión CON CAMPOS AÑADIDOS para
// el autorrelleno (no el PDF plano oficial), por eso la veille rastrea el oficial por su
// cuenta y no lo compara contra el archivo del repo. Sin dependencias (Node 18+).
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const PAGE = "https://www.inclusion.gob.es/web/migraciones/modelos-generales";
const BASE = "https://www.inclusion.gob.es";
const UA = { "user-agent": "Mozilla/5.0 (Aproba veille-ex)" };
const FP_PATH = path.join(process.cwd(), "forms", "ex", "fingerprints.json");
const BL_PATH = path.join(process.cwd(), "scripts", "veille-ex-official.json");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getBuf(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: UA });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last;
}

async function snapshot() {
  const codes = Object.keys(JSON.parse(await readFile(FP_PATH, "utf8"))).sort();
  const html = (await getBuf(PAGE)).toString("utf8");
  const hrefs = [...new Set([...html.matchAll(/href="(\/documents\/d\/migraciones\/ex[0-9]{2}[^"]*)"/gi)].map((m) => m[1]))];
  const snap = {};
  for (const code of codes) {
    const n = code.slice(3);
    const cands = hrefs
      .filter((h) => { const s = h.split("/").pop(); return new RegExp("^ex" + n + "([^0-9]|$)", "i").test(s) && !/editable/i.test(s); })
      .sort();
    const items = [];
    for (const h of cands) { const buf = await getBuf(BASE + h); items.push({ slug: h, sha256: sha(buf), bytes: buf.length }); }
    snap[code] = items;
  }
  return snap;
}

function diff(base, cur) {
  const lines = [];
  let changes = 0;
  for (const code of Object.keys(base)) {
    const bMap = Object.fromEntries((base[code] || []).map((x) => [x.slug, x.sha256]));
    const cMap = Object.fromEntries((cur[code] || []).map((x) => [x.slug, x.sha256]));
    const issues = [];
    for (const slug of Object.keys(bMap)) {
      if (!(slug in cMap)) issues.push(`enlace oficial retirado: ${slug}`);
      else if (bMap[slug] !== cMap[slug]) issues.push(`CONTENIDO cambió: ${slug} (${bMap[slug].slice(0, 10)} → ${cMap[slug].slice(0, 10)})`);
    }
    for (const slug of Object.keys(cMap)) if (!(slug in bMap)) issues.push(`nuevo enlace oficial: ${slug}`);
    if (issues.length) { changes++; lines.push(`- ⚠️ **${code}**\n` + issues.map((i) => `    - ${i}`).join("\n")); }
    else lines.push(`- ✅ **${code}** — sin cambios en el oficial`);
  }
  return { lines, changes };
}

async function main() {
  const init = process.argv.includes("--init");
  const cur = await snapshot();

  if (init || !existsSync(BL_PATH)) {
    await writeFile(BL_PATH, JSON.stringify(cur, null, 2) + "\n");
    console.log(`Baseline oficial guardado en ${path.relative(process.cwd(), BL_PATH)} (${Object.keys(cur).length} modelos).`);
    return;
  }

  const base = JSON.parse(await readFile(BL_PATH, "utf8"));
  const { lines, changes } = diff(base, cur);
  const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
  const head = changes === 0
    ? `# ✅ Veille modelos EX — sin cambios en los formularios oficiales (${fecha} UTC)\n`
    : `# ⚠️ Veille modelos EX — ${changes} modelo(s) cambiaron en el Ministerio (${fecha} UTC)\n\nUn formulario oficial cambió. Acción: re-descarga el PDF, revisa/rehaz el mapeo en \`lib/ex-forms.ts\`, regenera \`forms/ex/fingerprints.json\` y luego \`node scripts/veille-ex.mjs --init\` para actualizar el baseline.\n`;
  const out = head + "\n" + lines.join("\n") + "\n";
  console.log(out);
  await writeFile(path.join(process.cwd(), "veille-ex-report.md"), out);
  process.exit(changes === 0 ? 0 : 1);
}

main().catch((e) => { console.error("veille-ex falló:", e?.message || e); process.exit(2); });
