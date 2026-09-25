// FOTO de un despacho: los ids de todo lo que una migración puede crear. Se toma ANTES y
// DESPUÉS de importar (ejecutar.ts lo hace solo): la diferencia es exactamente lo creado,
// que es lo que verificar.ts cuenta y lo único que deshacer.ts puede borrar.
//
//   MIGRA_WS=<despacho> MIGRA_SALIDA=<carpeta> scripts/migracion/correr.sh scripts/migracion/foto.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdmin>;
export const TABLAS_MIGRACION = ["Cliente", "Empresa", "Familia", "ServicioHistorico", "Expediente", "Vencimiento"] as const;
export type Foto = { fecha: string; despacho: string; workspaceId: string; ids: Record<string, string[]> };

async function ids(admin: Admin, tabla: string, ws: string): Promise<string[]> {
  const out: string[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from(tabla).select("id").eq("workspaceId", ws).order("id").range(d, d + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as { id: string }[]).map((x) => x.id));
    if ((data ?? []).length < 1000) return out;
  }
}

export async function tomarFoto(admin: Admin, ws: string): Promise<Foto> {
  const { data: w, error } = await admin.from("Workspace").select("nombre").eq("id", ws).single();
  if (error || !w) throw new Error(`despacho ${ws} no encontrado`);
  const foto: Foto = { fecha: new Date().toISOString(), despacho: (w as { nombre: string }).nombre, workspaceId: ws, ids: {} };
  for (const t of TABLAS_MIGRACION) foto.ids[t] = await ids(admin, t, ws);
  return foto;
}

export const resumenFoto = (f: Foto) => TABLAS_MIGRACION.map((t) => `${t} ${f.ids[t]?.length ?? 0}`).join(" · ");

// Guardada con marca de tiempo en la carpeta de la migración (fuera del repositorio).
export function guardarFoto(f: Foto, carpeta: string, nombre: string): string {
  mkdirSync(carpeta, { recursive: true });
  const ruta = `${carpeta}/${nombre}-${f.fecha.replace(/[:.]/g, "-")}.json`;
  writeFileSync(ruta, JSON.stringify(f));
  return ruta;
}

if (process.argv.some((x) => x.endsWith("migracion/foto.ts"))) {
  (async () => {
    const ws = process.env.MIGRA_WS ?? "";
    const salida = process.env.MIGRA_SALIDA ?? "";
    if (!ws || !salida) throw new Error("faltan MIGRA_WS y MIGRA_SALIDA");
    const f = await tomarFoto(createSupabaseAdmin(), ws);
    console.log(`«${f.despacho}» · ${resumenFoto(f)}`);
    console.log("guardada en", guardarFoto(f, salida, "foto"));
  })().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
}
