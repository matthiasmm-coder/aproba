// RECUPERAR las fechas de caducidad que la IA ya extrajo y Vigía nunca usó.
//
// Al 18/08/2026 había 42 (32 pasaportes, 7 TIE, 3 otros) guardadas en Extraction.datos
// y tiradas, porque el sembrado solo miraba el TIE. El código nuevo siembra desde
// cualquier documento de identidad, pero solo para las subidas FUTURAS: este script
// rescata el histórico.
//
// ⚠️ ESCRIBE en los datos de clientes reales y hace crecer su pantalla de Vencimientos
// (y por tanto el digest diario). Por eso NO es automático y por defecto SIMULA.
//   node scripts/vigia-recuperar.mjs            → simula, no escribe nada
//   node scripts/vigia-recuperar.mjs --escribir → siembra de verdad
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ESCRIBIR = process.argv.includes("--escribir");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TIPOS = { tarjeta_residencia_tie: "TIE", pasaporte: "PASAPORTE", certificado_nie: "NIE" };
const iso = (v) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[0]}T00:00:00.000Z` : null;
};

const { data: ext } = await a.from("Extraction").select("documentoId, tipoDetectado, datos").limit(2000);
const candidatos = [];
for (const e of ext ?? []) {
  const tipo = TIPOS[e.tipoDetectado];
  if (!tipo) continue;
  const arr = Array.isArray(e.datos) ? e.datos : [];
  const fecha = iso(arr.find((x) => /caducidad/i.test(x?.label ?? ""))?.value);
  if (fecha) candidatos.push({ documentoId: e.documentoId, tipo, fecha });
}

// Documento → expediente → cliente + workspace
const docIds = candidatos.map((c) => c.documentoId);
const dueno = new Map();
for (let i = 0; i < docIds.length; i += 100) {
  const { data: docs } = await a.from("Documento").select("id, expedienteId, clienteId").in("id", docIds.slice(i, i + 100));
  const expIds = [...new Set((docs ?? []).map((d) => d.expedienteId).filter(Boolean))];
  const { data: exps } = expIds.length ? await a.from("Expediente").select("id, clienteId, workspaceId").in("id", expIds) : { data: [] };
  const porExp = new Map((exps ?? []).map((e) => [e.id, e]));
  for (const d of docs ?? []) {
    const e = porExp.get(d.expedienteId);
    if (e) dueno.set(d.id, { clienteId: d.clienteId || e.clienteId, workspaceId: e.workspaceId, expedienteId: e.id });
  }
}

const { data: wss } = await a.from("Workspace").select("id, nombre");
const nombre = new Map((wss ?? []).map((w) => [w.id, w.nombre]));
const hoy = new Date().toISOString();
let sembrados = 0, saltados = 0, caducados = 0;
const porWs = {};

for (const c of candidatos) {
  const d = dueno.get(c.documentoId);
  if (!d?.clienteId) { saltados++; continue; }
  if (c.fecha < hoy) { caducados++; continue; } // ya caducado: avisar no sirve de nada
  const { data: activos } = await a.from("Vencimiento").select("id")
    .eq("clienteId", d.clienteId).eq("tipo", c.tipo).in("estado", ["PENDIENTE", "AVISADO", "TRAMITANDO"]).limit(1);
  if (activos?.length) { saltados++; continue; }   // ya lo tiene: no duplicar
  const ws = nombre.get(d.workspaceId) ?? "?";
  porWs[ws] = porWs[ws] ?? {};
  porWs[ws][c.tipo] = (porWs[ws][c.tipo] ?? 0) + 1;
  sembrados++;
  if (ESCRIBIR) {
    await a.from("Vencimiento").insert({
      id: crypto.randomUUID(), workspaceId: d.workspaceId, clienteId: d.clienteId,
      expedienteId: d.expedienteId, fecha: c.fecha, tipo: c.tipo, estado: "PENDIENTE", updatedAt: hoy,
    });
  }
}

console.log(`${ESCRIBIR ? "SEMBRADOS" : "SE SEMBRARÍAN"}: ${sembrados}`);
for (const [ws, tipos] of Object.entries(porWs)) {
  console.log(`   ${ws}: ${Object.entries(tipos).map(([t, n]) => `${n}× ${t}`).join(", ")}`);
}
console.log(`   ya tenían vencimiento o sin cliente: ${saltados}   |   fecha ya pasada: ${caducados}`);
if (!ESCRIBIR) console.log("\n(simulación: no se ha escrito nada — añade --escribir para sembrar)");
