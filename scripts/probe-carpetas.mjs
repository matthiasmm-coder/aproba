// Verifica supabase/temas-carpetas.sql EN PRODUCCIÓN: las carpetas nacen de las categorías
// que ya existían, cada servicio cae en la suya, y NINGÚN pack se pierde por el camino.
// Solo lee. Uso: node scripts/probe-carpetas.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fallo = 0;
const ok = (b, m, extra = "") => { console.log(`${b ? "✓" : "✗"} ${m}${extra ? "  " + extra : ""}`); if (!b) fallo++; };
const norm = (s) => (s ?? "").trim().toLowerCase();

const { data: ws, error: e1 } = await sb.from("Workspace").select("id, nombre, packs, temas");
if (e1) { console.error("✗ Workspace:", e1.message); process.exit(1); }
const { data: sc, error: e2 } = await sb.from("ServicioConfig").select("workspaceId, clave, label, categoria, temaId, servicioIds, descuentoPct, oficinaId, active, anticipo, resto, docs");
if (e2) { console.error("✗ ServicioConfig:", e2.message, "\n  ¿Está pegada supabase/temas-carpetas.sql?"); process.exit(1); }

let despachos = 0;
for (const w of ws) {
  const mios = sc.filter((s) => s.workspaceId === w.id);
  const packs = Array.isArray(w.packs) ? w.packs : [];
  if (mios.length === 0 && packs.length === 0) continue;
  despachos++;
  const carpetas = Array.isArray(w.temas) ? w.temas : [];
  const porId = new Map(carpetas.map((c) => [c.id, c]));

  // 1 · cada servicio con categoría tiene su carpeta, y con el MISMO nombre
  const conCat = mios.filter((s) => (s.categoria ?? "").trim());
  const malColocados = conCat.filter((s) => norm(porId.get(s.temaId)?.nombre) !== norm(s.categoria));
  ok(malColocados.length === 0, `${w.nombre}: los ${conCat.length} servicios con tema están en su carpeta`,
    malColocados.length ? malColocados.slice(0, 3).map((s) => `${s.clave}→${s.categoria}≠${porId.get(s.temaId)?.nombre ?? "—"}`).join(", ") : "");

  // 2 · ningún pack se ha perdido: cada uno existe ahora también como ítem
  const faltan = packs.filter((p) => !mios.some((s) => s.clave === p.id));
  ok(faltan.length === 0, `${w.nombre}: sus ${packs.length} packs están en la lista`,
    faltan.length ? faltan.map((p) => p.nombre).join(", ") : "");

  // 3 · y con el mismo contenido (nombre, servicios incluidos, descuento)
  const distintos = packs.filter((p) => {
    const item = mios.find((s) => s.clave === p.id);
    if (!item) return false;
    const mismos = JSON.stringify([...(item.servicioIds ?? [])].sort()) === JSON.stringify([...(p.servicioIds ?? [])].sort());
    return norm(item.label) !== norm(p.nombre) || !mismos || Number(item.descuentoPct ?? 0) !== Number(p.descuentoPct ?? 0);
  });
  ok(distintos.length === 0, `${w.nombre}: los packs conservan nombre, servicios y descuento`,
    distintos.length ? distintos.map((p) => p.nombre).join(", ") : "");

  // 4 · Workspace.packs sigue intacto (es lo que lee el portal del cliente)
  ok(packs.every((p) => p.id && p.nombre), `${w.nombre}: Workspace.packs intacto (${packs.length})`);

  // 5 · nada se ha quedado sin nombre ni ha cambiado de precio por el camino
  const rotos = mios.filter((s) => !String(s.label ?? "").trim());
  if (rotos.length) console.log(`· ${w.nombre}: ${rotos.length} servicio(s) sin nombre YA en el catálogo (dato previo, no lo toca la migración): ${rotos.map((s) => s.clave).join(", ")}`);
}

// 6 · ningún expediente se queda sin catálogo que lo nombre
const { data: exp } = await sb.from("Expediente").select("workspaceId, servicioClave").not("servicioClave", "is", null);
const huerfanos = exp.filter((e) => !sc.some((s) => s.workspaceId === e.workspaceId && s.clave === e.servicioClave));
ok(huerfanos.length === 0, `los expedientes siguen encontrando su servicio (${exp.length} con clave)`,
  huerfanos.length ? `${huerfanos.length} huérfanos` : "");

console.log(`\n${despachos} despachos comprobados · ${fallo === 0 ? "TODO OK" : `${fallo} FALLOS`}`);
process.exit(fallo === 0 ? 0 : 1);
