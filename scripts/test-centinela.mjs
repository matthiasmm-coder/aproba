// Prueba e2e del Funcionario Fantasma contra un expediente real (llamada Claude REAL).
// Uso: node --loader ./scripts/ts-loader.mjs scripts/test-centinela.mjs <expedienteId>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const { revisarExpediente } = await import("../lib/centinela.ts");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const id = process.argv[2];
if (!id) { console.error("Falta expedienteId"); process.exit(1); }
const t0 = Date.now();
const r = await revisarExpediente(admin, id);
console.log(`⏱ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if ("error" in r) { console.error("ERROR:", r.error); process.exit(1); }
const { verdicto, hallazgos, comprobado, noComprobable } = r.revision;
console.log(`VERDICTO: ${verdicto}`);
for (const h of hallazgos) console.log(`  [${h.severidad}] ${h.titulo}\n     → ${h.motivo}\n     requisito: ${h.requisito} · docs: ${h.documentos.join(", ")}`);
console.log("COMPROBADO:", comprobado.join(" · "));
console.log("NO COMPROBABLE:", noComprobable.join(" · "));
