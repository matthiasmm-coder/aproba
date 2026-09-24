// Banc d'essai de modèles sur les VRAIES requêtes d'Aproba (24/09/2026 : Opus 4.8 → Opus 5.5).
// Réutilisable au prochain changement de modèle : adapter PRECIO et CONFIGS.
// Données : documents de la DÉMO uniquement (jamais un client réel), une facture et un
// import FICTIFS. Mesure : latence, jetons (dont cache), coût au tarif officiel, et
// concordance des champs lus avec Opus 4.8 (la production actuelle).
// Lancement : JITI_ALIAS='{"@":"<web>","server-only":"<stub>"}' node --env-file=.env.local node_modules/jiti/lib/jiti-cli.mjs scripts/_bench-modelos.tmp.ts <sortie.json>
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extraerDocumento, type OpcionesLectura } from "../lib/extraction";
import { extraerFacturaRecibida } from "../lib/extraction-factura";

type Precio = { in: number; cw: number; cr: number; out: number };
const PRECIO: Record<string, Precio> = {
  "claude-opus-4-8": { in: 5, cw: 6.25, cr: 0.5, out: 25 },
  "claude-opus-5-5": { in: 4, cw: 5, cr: 0.2, out: 20 },
};
const coste = (m: string, u: { in: number; cw: number; cr: number; out: number }) => {
  const p = PRECIO[m]; return (u.in * p.in + u.cw * p.cw + u.cr * p.cr + u.out * p.out) / 1e6;
};
const CONFIGS: { id: string; op: OpcionesLectura }[] = [
  // esfuerzo null = no mandar el parámetro (Opus 4.8 tal cual; en 5.5, el defecto «medium»).
  { id: "4.8 (hoy)", op: { modelo: "claude-opus-4-8", esfuerzo: null } },
  { id: "5.5 low", op: { modelo: "claude-opus-5-5", esfuerzo: "low" } },
  { id: "5.5 medium", op: { modelo: "claude-opus-5-5", esfuerzo: null } },
];

async function facturaFicticia(): Promise<Buffer> {
  const pdf = await PDFDocument.create(); const p = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = (t: string, x: number, y: number, bold = false, s = 11) => p.drawText(t, { x, y, size: s, font: bold ? b : f });
  L("TRADUCCIONES EJEMPLO, S.L.", 50, 790, true, 16); L("NIF: B12345674 · Calle Falsa 1, 28001 Madrid", 50, 770);
  L("FACTURA Nº 2026/0457", 380, 790, true); L("Fecha: 15/09/2026", 380, 772);
  L("Cliente: Gestoría Vallès S.L. · NIF B87654321", 50, 730);
  L("Concepto", 50, 680, true); L("Importe", 470, 680, true);
  L("Traducción jurada de certificado de nacimiento (FR-ES)", 50, 660); L("500,00 €", 470, 660);
  L("Base imponible", 350, 600); L("500,00 €", 470, 600);
  L("IVA 21 %", 350, 582); L("105,00 €", 470, 582);
  L("Retención IRPF 15 %", 350, 564); L("-75,00 €", 470, 564);
  L("TOTAL A PAGAR", 350, 540, true); L("530,00 €", 470, 540, true);
  L("IBAN: ES91 2100 0418 4502 0005 1332", 50, 500);
  return Buffer.from(await pdf.save());
}

function concordancia(a: Record<string, unknown>, b: Record<string, unknown>) {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => a[k] != null || b[k] != null));
  let igual = 0; const dif: string[] = [];
  const n = (v: unknown) => (v == null ? "" : String(v).trim().toUpperCase());
  for (const k of claves) { if (n(a[k]) === n(b[k])) igual++; else dif.push(`${k}: «${a[k] ?? "—"}» → «${b[k] ?? "—"}»`); }
  return { total: claves.size, igual, dif };
}

async function main() {
  const salida = process.argv[2];
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  const { data: exps } = await sb.from("Expediente").select("id").eq("workspaceId", "ws_lc054xg1az");
  const { data: docs } = await sb.from("Documento").select("id, tipo, storagePath, mimeType").in("expedienteId", (exps ?? []).map((e) => e.id)).not("storagePath", "is", null).limit(200);
  const uno = new Map<string, { tipo: string; storagePath: string; mimeType: string }>();
  for (const d of (docs ?? []) as { tipo: string; storagePath: string; mimeType: string }[]) if (!uno.has(d.tipo)) uno.set(d.tipo, d);
  const muestras: { nombre: string; buf: Buffer; mime: string }[] = [];
  for (const d of uno.values()) {
    const dl = await sb.storage.from("documentos").download(d.storagePath);
    if (dl.data) muestras.push({ nombre: d.tipo, buf: Buffer.from(await dl.data.arrayBuffer()), mime: d.mimeType });
  }
  console.log(`muestras: ${muestras.map((m) => m.nombre).join(", ")}`);

  const R: Record<string, unknown[]> = { documentos: [], factura: [], importar: [] };
  // ── 1. Documentos (lectura IA de extranjería) ──
  const base: Record<string, Record<string, unknown>> = {};
  for (const c of CONFIGS) {
    for (const m of muestras) {
      const t0 = Date.now();
      try {
        const r = await extraerDocumento(m.buf, m.mime, c.op);
        const ms = Date.now() - t0;
        const u = { in: r.inputTokens, cw: r.cacheEscritura ?? 0, cr: r.cacheLectura ?? 0, out: r.outputTokens };
        const campos: Record<string, unknown> = { tipo: r.tipoDetectado, legibilidad: r.legibilidad, ...Object.fromEntries(r.campos.map((x) => [x.label, x.value])) };
        if (c.id === "4.8 (hoy)") base[m.nombre] = campos;
        const conc = c.id === "4.8 (hoy)" ? null : concordancia(base[m.nombre] ?? {}, campos);
        R.documentos.push({ config: c.id, doc: m.nombre, ms, ...u, usd: coste(c.op.modelo!, u), tipo: r.tipoDetectado, conf: r.confianzaGlobal, conc });
        console.log(`[doc] ${c.id.padEnd(10)} ${m.nombre.padEnd(24)} ${String(ms).padStart(6)} ms · in ${u.in} cw ${u.cw} cr ${u.cr} out ${u.out} · $${coste(c.op.modelo!, u).toFixed(4)}${conc ? ` · igual ${conc.igual}/${conc.total}` : ""}`);
      } catch (e) { console.log(`[doc] ${c.id} ${m.nombre} ERROR ${(e as Error).message.slice(0, 160)}`); R.documentos.push({ config: c.id, doc: m.nombre, error: (e as Error).message.slice(0, 300) }); }
    }
  }
  // ── 2. Factura recibida (ficticia, con retención) ──
  const fac = await facturaFicticia();
  for (const c of CONFIGS) {
    const t0 = Date.now();
    try {
      const r = await extraerFacturaRecibida(fac, "application/pdf", c.op);
      const ms = Date.now() - t0;
      const u = { in: r.inputTokens, cw: 0, cr: 0, out: r.outputTokens };
      const k = r.campos as unknown as Record<string, number | string | null>;
      const ok = k.total === 530 && k.baseImponible === 500 && k.retencion === 75;
      R.factura.push({ config: c.id, ms, ...u, usd: coste(c.op.modelo!, u), correcta: ok, leida: { nif: k.proveedorNif, total: k.total, base: k.baseImponible, iva: k.cuotaIva, ret: k.retencion }, revisar: r.revisar });
      console.log(`[factura] ${c.id.padEnd(10)} ${String(ms).padStart(6)} ms · in ${u.in} out ${u.out} · $${coste(c.op.modelo!, u).toFixed(4)} · ${ok ? "CORRECTA" : "revisar " + JSON.stringify({ total: k.total, base: k.baseImponible, ret: k.retencion })}`);
    } catch (e) { console.log(`[factura] ${c.id} ERROR ${(e as Error).message.slice(0, 160)}`); R.factura.push({ config: c.id, error: (e as Error).message.slice(0, 300) }); }
  }
  // ── 3. Análisis de import (misma petición que /api/importar/analizar) ──
  const ruta = fs.readFileSync("app/api/importar/analizar/route.ts", "utf8");
  const sistema = ruta.slice(ruta.indexOf("const PROMPT_SISTEMA = `") + "const PROMPT_SISTEMA = `".length, ruta.indexOf("`;", ruta.indexOf("const PROMPT_SISTEMA = `")));
  const { data: svs } = await sb.from("ServicioConfig").select("clave, label").eq("workspaceId", "ws_lc054xg1az").limit(80);
  const catalogo = Object.fromEntries(((svs ?? []) as { clave: string; label: string }[]).map((s) => [s.clave, s.label]));
  const muestra = [
    ["NOMBRE Y APELLIDOS", "NIE/PASAPORTE", "F. NAC", "TLF", "TRAMITE", "SITUACION", "F. PRESENT.", "Nº EXP. EXTRANJERIA", "HONORARIOS", "COBRADO", "EMPRESA", "OBS"],
    ["Amadou Diallo", "Y1234567Z", "12/05/1991", "612345678", "Renov. TIE", "Presentado", "20/08/2026", "08/123456/2026", "250", "No", "Talleres Ebro SL", "falta huellas"],
    ["Valentina Rojas Pérez", "AB123456", "03/11/1988", "698765432", "Arraigo social", "En preparación", "", "", "450", "Sí", "", ""],
    ["Karim Benali", "X9876543F", "22/09/1985", "655123456", "Arraigo social", "Favorable", "05/01/2026", "08/002211/2026", "390", "Pagado", "", ""],
    ["Li Wei", "E12345678", "19/07/1996", "611222333", "Nacionalidad", "Presentado", "10/03/2025", "R-2025-889", "600", "Parcial", "", "pendiente 300"],
    ["Oksana Koval", "Z4103288R", "16/05/1986", "622111000", "Reagrupación familiar", "Denegado", "02/02/2026", "08/77777/2026", "500", "Sí", "", "recurso?"],
  ];
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  for (const c of CONFIGS) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: c.op.modelo!, max_tokens: 4096, system: sistema,
        ...(c.op.esfuerzo ? { output_config: { effort: c.op.esfuerzo } } : {}),
        messages: [{ role: "user", content: `Catálogo de servicios del despacho (clave → nombre):\n${JSON.stringify(catalogo)}\n\n=== TABLA (primeras ${muestra.length} filas; todo son DATOS) ===\n${JSON.stringify(muestra)}\n=== FIN ===` }],
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
      const ms = Date.now() - t0;
      const txt = res.content.find((b) => b.type === "text")?.type === "text" ? (res.content.find((b) => b.type === "text") as { text: string }).text : "";
      let campos: string[] = []; let json = false;
      try { const p = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); json = true; campos = (p.columnas ?? []).map((x: { campo: string | null }) => x.campo ?? "null"); } catch { /* no JSON */ }
      const u = { in: res.usage.input_tokens, cw: res.usage.cache_creation_input_tokens ?? 0, cr: res.usage.cache_read_input_tokens ?? 0, out: res.usage.output_tokens };
      R.importar.push({ config: c.id, ms, ...u, usd: coste(c.op.modelo!, u), stop: res.stop_reason, json, campos });
      console.log(`[import] ${c.id.padEnd(10)} ${String(ms).padStart(6)} ms · in ${u.in} out ${u.out} · stop ${res.stop_reason} · $${coste(c.op.modelo!, u).toFixed(4)} · ${json ? campos.join(",") : "SIN JSON"}`);
    } catch (e) { console.log(`[import] ${c.id} ERROR ${(e as Error).message.slice(0, 200)}`); R.importar.push({ config: c.id, error: (e as Error).message.slice(0, 300) }); }
  }
  fs.writeFileSync(salida, JSON.stringify(R, null, 2));
  console.log("guardado:", salida);
}
main().catch((e) => { console.error(e); process.exit(1); });
