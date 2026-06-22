import { createHash } from "node:crypto";

// Veille proactive des modelos EX oficiales — lógica compartida.
// La usa el cron de Vercel (app/api/cron/veille-ex/route.ts) para alertar por email
// cuando el Ministerio cambia un formulario. El CLI scripts/veille-ex.mjs replica esta
// misma lógica y, además, permite regenerar el baseline con `--init`.
//
// Toma una "foto" (slug → sha256) de los PDF oficiales de los modelos que Aproba mapea
// (los de forms/ex/fingerprints.json) y la compara con el baseline guardado en
// scripts/veille-ex-official.json. Sin dependencias externas (fetch + node:crypto).

const PAGE = "https://www.inclusion.gob.es/web/migraciones/modelos-generales";
const BASE = "https://www.inclusion.gob.es";
const UA = { "user-agent": "Mozilla/5.0 (Aproba veille-ex)" };

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Item = { slug: string; sha256: string; bytes: number };
export type Snap = Record<string, Item[]>;

async function getBuf(url: string, tries = 4): Promise<Buffer> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: UA });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await sleep(1200 * (i + 1)); }
  }
  throw last;
}

/** Foto actual de los PDF oficiales para los códigos dados (p. ej. ["EX-01", ...]). */
export async function snapshot(codes: string[]): Promise<Snap> {
  const html = (await getBuf(PAGE)).toString("utf8");
  const hrefs = [...new Set(
    [...html.matchAll(/href="(\/documents\/d\/migraciones\/ex[0-9]{2}[^"]*)"/gi)].map((m) => m[1]),
  )];
  const snap: Snap = {};
  for (const code of codes) {
    const n = code.slice(3); // "EX-01" -> "01"
    const cands = hrefs
      .filter((h) => {
        const s = h.split("/").pop() ?? "";
        return new RegExp("^ex" + n + "([^0-9]|$)", "i").test(s) && !/editable/i.test(s);
      })
      .sort();
    const items: Item[] = [];
    for (const h of cands) { const buf = await getBuf(BASE + h); items.push({ slug: h, sha256: sha(buf), bytes: buf.length }); }
    snap[code] = items;
  }
  return snap;
}

/** Compara baseline vs foto actual y devuelve las diferencias por modelo. */
export function diff(base: Snap, cur: Snap): { lines: string[]; changes: number } {
  const lines: string[] = [];
  let changes = 0;
  for (const code of Object.keys(base)) {
    const bMap = Object.fromEntries((base[code] || []).map((x) => [x.slug, x.sha256]));
    const cMap = Object.fromEntries((cur[code] || []).map((x) => [x.slug, x.sha256]));
    const issues: string[] = [];
    for (const slug of Object.keys(bMap)) {
      if (!(slug in cMap)) issues.push(`enlace oficial retirado: ${slug}`);
      else if (bMap[slug] !== cMap[slug]) issues.push(`CONTENIDO cambió: ${slug} (${bMap[slug].slice(0, 10)} → ${cMap[slug].slice(0, 10)})`);
    }
    for (const slug of Object.keys(cMap)) if (!(slug in bMap)) issues.push(`nuevo enlace oficial: ${slug}`);
    if (issues.length) { changes++; lines.push(`⚠️ ${code}\n` + issues.map((i) => `   - ${i}`).join("\n")); }
    else lines.push(`✅ ${code} — sin cambios`);
  }
  return { lines, changes };
}
