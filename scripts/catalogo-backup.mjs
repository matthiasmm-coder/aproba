// Copia de seguridad del CATÁLOGO de todos los despachos (servicios, packs y carpetas),
// y restauración exacta a partir de ella. Solo lectura salvo que se pida restaurar.
//
//   node scripts/catalogo-backup.mjs                       → guarda una copia
//   node scripts/catalogo-backup.mjs restaurar <fichero>   → la vuelve a poner
//
// La restauración es fila a fila (upsert por id) y devuelve packs/temas tal cual: deja la
// base exactamente como estaba en el momento de la copia.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DIR = path.join(os.homedir(), "aproba", "backups");

if (process.argv[2] === "restaurar") {
  const fichero = process.argv[3];
  if (!fichero || !fs.existsSync(fichero)) { console.error("Falta el fichero de copia."); process.exit(1); }
  const copia = JSON.parse(fs.readFileSync(fichero, "utf8"));
  for (const w of copia.workspaces) {
    const { error } = await sb.from("Workspace").update({ packs: w.packs, temas: w.temas }).eq("id", w.id);
    if (error) console.error("✗", w.nombre, error.message);
  }
  // Las filas que existan de más (creadas después de la copia) se van; las de la copia vuelven.
  const idsCopia = new Set(copia.servicios.map((s) => s.id));
  const { data: ahora } = await sb.from("ServicioConfig").select("id");
  const sobran = (ahora ?? []).filter((r) => !idsCopia.has(r.id)).map((r) => r.id);
  for (let i = 0; i < sobran.length; i += 50) {
    const { error } = await sb.from("ServicioConfig").delete().in("id", sobran.slice(i, i + 50));
    if (error) console.error("✗ borrando sobrantes:", error.message);
  }
  for (let i = 0; i < copia.servicios.length; i += 50) {
    const { error } = await sb.from("ServicioConfig").upsert(copia.servicios.slice(i, i + 50), { onConflict: "id" });
    if (error) console.error("✗ restaurando servicios:", error.message);
  }
  console.log(`restaurado: ${copia.servicios.length} servicios, ${copia.workspaces.length} despachos (copia del ${copia.fecha})`);
  process.exit(0);
}

const { data: workspaces, error: e1 } = await sb.from("Workspace").select("id, nombre, packs, temas");
if (e1) { console.error(e1.message); process.exit(1); }
const { data: servicios, error: e2 } = await sb.from("ServicioConfig").select("*");
if (e2) { console.error(e2.message); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });
const nombre = `catalogo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`;
const destino = path.join(DIR, nombre);
fs.writeFileSync(destino, JSON.stringify({ fecha: new Date().toISOString(), workspaces, servicios }, null, 1));
const packs = workspaces.reduce((a, w) => a + (Array.isArray(w.packs) ? w.packs.length : 0), 0);
const temas = workspaces.reduce((a, w) => a + (Array.isArray(w.temas) ? w.temas.length : 0), 0);
console.log(`→ ${destino}\n   ${servicios.length} servicios · ${packs} packs · ${temas} carpetas · ${workspaces.length} despachos`);
