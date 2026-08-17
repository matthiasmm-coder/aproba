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
// ⚠️ UA de navigateur : avec un UA « bot » le ministère répond 403 + une page HTML,
// que la veille hachait comme si c'était le PDF → fausses alertes (17/08/2026).
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "accept": "application/pdf,*/*" };
const FP_PATH = path.join(process.cwd(), "forms", "ex", "fingerprints.json");
const BL_PATH = path.join(process.cwd(), "scripts", "veille-ex-official.json");
const sha = (b) => createHash("sha256").update(b).digest("hex");

// Empreinte SÉMANTIQUE d'un PDF : textes + positions arrondis. Le Ministère
// ré-exporte régulièrement ses PDF (métadonnées, compression) sans toucher au
// contenu : le sha256 binaire change alors que RIEN ne bouge pour nous. Notre
// mapeo (lib/ex-forms.ts) ne dépend que des libellés et de leurs coordonnées,
// donc c'est ça qu'on surveille. Renvoie null si ce n'est pas un PDF lisible.
async function huellaSemantica(buf) {
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
    const partes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      for (const it of (await page.getTextContent()).items) {
        const t = it.str?.trim();
        if (t) partes.push(`${p}|${Math.round(it.transform[4])}|${Math.round(it.transform[5])}|${t}`);
      }
    }
    return { sha: sha(Buffer.from(partes.join("\n"), "utf8")), textos: partes.length, paginas: doc.numPages };
  } catch { return null; }
}
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
    for (const h of cands) {
      const buf = await getBuf(BASE + h);
      const hs = await huellaSemantica(buf);
      // esPdf=false → la URL ya no sirve el PDF (movida, 403, página HTML): se avisa
      // como «no accesible», NUNCA como «el contenido cambió».
      items.push({ slug: h, sha256: sha(buf), bytes: buf.length, esPdf: Boolean(hs), semantica: hs?.sha ?? null, textos: hs?.textos ?? null, paginas: hs?.paginas ?? null });
    }
    snap[code] = items;
  }
  return snap;
}

function diff(base, cur) {
  const lines = [];
  let changes = 0;
  // Se avisa por lo que ROMPE el producto: que se muevan los textos/posiciones del
  // modelo (de ahí depende el mapeo de lib/ex-forms.ts). Un re-export del Ministerio
  // cambia el sha256 binario sin tocar nada: eso se registra como nota, no como alerta.
  for (const code of Object.keys(base)) {
    const bMap = Object.fromEntries((base[code] || []).map((x) => [x.slug, x]));
    const cMap = Object.fromEntries((cur[code] || []).map((x) => [x.slug, x]));
    const issues = [];   // cuentan como cambio → alerta
    const notas = [];    // informativas → no disparan alerta
    // Un mismo modelo puede servirse desde varias URL: si el contenido semántico
    // sigue estando en ALGUNA, un enlace retirado es una mudanza, no una pérdida.
    const semActuales = new Set(Object.values(cMap).filter((x) => x.esPdf).map((x) => x.semantica));
    for (const [slug, b] of Object.entries(bMap)) {
      const c = cMap[slug];
      if (!c) {
        if (b.semantica && semActuales.has(b.semantica)) notas.push(`enlace movido (mismo contenido): ${slug}`);
        else issues.push(`enlace oficial retirado: ${slug}`);
        continue;
      }
      if (!c.esPdf) { notas.push(`no accesible como PDF ahora mismo (¿403 o página HTML?): ${slug}`); continue; }
      if (b.semantica && c.semantica && b.semantica !== c.semantica) {
        const dTex = b.textos != null && c.textos != null ? ` · textos ${b.textos}→${c.textos}` : "";
        const dPag = b.paginas != null && c.paginas != null && b.paginas !== c.paginas ? ` · páginas ${b.paginas}→${c.paginas}` : "";
        issues.push(`EL MODELO CAMBIÓ (textos/posiciones): ${slug}${dTex}${dPag} → revisa el mapeo en lib/ex-forms.ts`);
      } else if (b.sha256 !== c.sha256) {
        notas.push(`re-exportado por el Ministerio, contenido idéntico: ${slug} (${b.sha256.slice(0, 10)} → ${c.sha256.slice(0, 10)})`);
      }
    }
    for (const [slug, c] of Object.entries(cMap)) {
      if (slug in bMap) continue;
      if (c.esPdf && c.semantica && Object.values(bMap).some((b) => b.semantica === c.semantica)) notas.push(`nuevo enlace, mismo contenido: ${slug}`);
      else issues.push(`nuevo enlace oficial: ${slug}`);
    }
    if (issues.length) { changes++; lines.push(`- ⚠️ **${code}**\n` + [...issues, ...notas].map((i) => `    - ${i}`).join("\n")); }
    else if (notas.length) lines.push(`- ✅ **${code}** — sin cambios que nos afecten\n` + notas.map((i) => `    - ${i}`).join("\n"));
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
