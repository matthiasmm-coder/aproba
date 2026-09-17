#!/usr/bin/env node
// Configura VERI*FACTU (clave de empresa Verifacti) para un despacho SIN entrar en su
// cuenta — para los clientes reales, cuya sesión Aproba no tiene. La clave viaja SOLO por
// la variable de entorno (nunca por chat ni por argumento visible en `ps`):
//
//   VERIFACTI_API_KEY='…' node scripts/verifactu-config.mjs --workspace <id> --nif <NIF>
//   node scripts/verifactu-config.mjs --workspace <id> --nif <NIF> --pausar | --reanudar | --quitar
//   node scripts/verifactu-config.mjs --workspace <id> --estado
//
// Cifra con el MISMO algoritmo que lib/cifrado.ts (AES-256-GCM, scrypt de
// SUPABASE_SERVICE_ROLE_KEY con sal "aproba/verifacti/v1"); lee .env.local del proyecto.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SAL = "aproba/verifacti/v1";
export function cifrarConSeed(plano, seed, sal = SAL) {
  const k = crypto.scryptSync(seed, sal, 32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plano, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function leerEnv() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const f of [".env.local", ".env"]) {
    const p = path.join(raiz, f);
    if (!fs.existsSync(p)) continue;
    for (const linea of fs.readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function arg(nombre) { const i = process.argv.indexOf(nombre); return i >= 0 ? process.argv[i + 1] : undefined; }
const flag = (nombre) => process.argv.includes(nombre);

async function main() {
  leerEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, seed = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !seed) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  const workspaceId = arg("--workspace");
  if (!workspaceId) throw new Error("Falta --workspace <id>.");
  const admin = createClient(url, seed, { auth: { persistSession: false } });
  const nif = String(arg("--nif") ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

  if (flag("--estado")) {
    const { data, error } = await admin.from("VerifactuConfig").select("nif, entorno, activo, ultimaComprobacion, ultimoError, updatedAt").eq("workspaceId", workspaceId);
    if (error) throw error;
    const { data: regs } = await admin.from("VerifactuRegistro").select("tipo, estado").eq("workspaceId", workspaceId);
    const cuenta = {};
    for (const r of regs ?? []) cuenta[`${r.tipo}:${r.estado}`] = (cuenta[`${r.tipo}:${r.estado}`] ?? 0) + 1;
    console.log(JSON.stringify({ configs: data, registros: cuenta }, null, 2));
    return;
  }
  if (!nif) throw new Error("Falta --nif <NIF>.");

  if (flag("--quitar")) {
    const { error } = await admin.from("VerifactuConfig").delete().eq("workspaceId", workspaceId).eq("nif", nif);
    if (error) throw error;
    console.log(`Clave retirada para ${nif} en ${workspaceId}.`); return;
  }
  if (flag("--pausar") || flag("--reanudar")) {
    const { error } = await admin.from("VerifactuConfig").update({ activo: flag("--reanudar"), updatedAt: new Date().toISOString() }).eq("workspaceId", workspaceId).eq("nif", nif);
    if (error) throw error;
    console.log(`${flag("--reanudar") ? "Reanudado" : "Pausado"} ${nif} en ${workspaceId}.`); return;
  }

  const apiKey = (process.env.VERIFACTI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Falta VERIFACTI_API_KEY en el entorno.");
  // Comprobación real contra Verifacti: la clave debe pertenecer a ESTE NIF.
  const base = (process.env.VERIFACTI_BASE_URL ?? "https://api.verifacti.com").replace(/\/$/, "");
  const res = await fetch(`${base}/verifactu/health`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const salud = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Verifacti no acepta la clave (HTTP ${res.status}): ${salud.error ?? salud.message ?? ""}`);
  const nifClave = String(salud.nif ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (nifClave && nifClave !== nif) throw new Error(`La clave pertenece al NIF ${nifClave}, no a ${nif}.`);
  const entorno = /prod/i.test(String(salud.entorno ?? "")) ? "prod" : "test";

  const ahora = new Date().toISOString();
  const patch = { entorno, apiKeyEnc: cifrarConSeed(apiKey, seed), activo: true, ultimaComprobacion: ahora, ultimoError: null, updatedAt: ahora };
  const { data: ex, error: eSel } = await admin.from("VerifactuConfig").select("id").eq("workspaceId", workspaceId).eq("nif", nif).maybeSingle();
  if (eSel) throw eSel;
  const { error } = ex
    ? await admin.from("VerifactuConfig").update(patch).eq("id", ex.id)
    : await admin.from("VerifactuConfig").insert({ id: crypto.randomUUID(), workspaceId, nif, ...patch });
  if (error) throw error;
  console.log(`VERI*FACTU ${ex ? "actualizado" : "configurado"}: ${nif} · entorno ${entorno} · activo · workspace ${workspaceId}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error("ERROR:", e.message ?? e); process.exit(1); });
}
