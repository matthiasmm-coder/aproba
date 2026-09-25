// EJECUTAR UNA MIGRACIÓN con la ruta REAL de import (/api/importar/ejecutar), fuera de Next:
// fases 5 (simulación) y 7 (import) de web/MIGRACION.md. Mismo código que el botón «Importar»,
// sin límite de 1.500 filas (se importa por pasadas) y con fotos antes/después.
//
// Entrada — MIGRA_ARCHIVO: JSON { cabecera: string[], filas: string[][], mapeo: Mapeo,
//   overrides?: Record<number, OverrideFila>, oficinaId?: string } (lo deja el adaptador de la
//   fase 4, con el mapeo revisado a mano).
//
// SIMULACIÓN (por defecto): nada se escribe. Lee la cartera del despacho y dice qué pasaría:
// personas nuevas o ya existentes, homónimos dudosos, servicios, los que ya están, empresas,
// renovaciones, trámites sin servicio y todos los avisos.
//   MIGRA_WS=… MIGRA_USER=… MIGRA_ARCHIVO=… scripts/migracion/correr.sh scripts/migracion/ejecutar.ts
//
// IMPORT: además MIGRA_CONFIRMAR=si, MIGRA_DESPACHO="<nombre EXACTO del despacho>" (segunda
// llave: nunca se escribe en otro despacho por un id copiado mal) y MIGRA_SALIDA=<carpeta de la
// migración, fuera del repo> (foto antes, foto después y registro).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import * as servidor from "@/lib/supabase/server";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { aplicarMapeo, aplicarOverrides, type Mapeo, type OverrideFila } from "@/lib/importar";
import { caducidadDeGrupo, crearIndicePersonas, fusionarFichas, marcarMismaPersona } from "@/lib/importar-personas";
import { tomarFoto, guardarFoto, resumenFoto } from "./foto";

const PASADA = 1500; // tope de filas de la ruta por llamada
type Entrada = { cabecera: string[]; filas: string[][]; mapeo: Mapeo; overrides?: Record<number, OverrideFila>; oficinaId?: string | null };

(async () => {
  const ws = process.env.MIGRA_WS ?? "";
  const user = process.env.MIGRA_USER ?? "";
  const archivo = process.env.MIGRA_ARCHIVO ?? "";
  if (!ws || !user || !archivo) throw new Error("faltan MIGRA_WS, MIGRA_USER y MIGRA_ARCHIVO");
  if (!(servidor as Record<string, unknown>).__STUB_MIGRACION__) throw new Error("sin sesion-stub: usa scripts/migracion/correr.sh");
  const entrada = JSON.parse(readFileSync(archivo, "utf8")) as Entrada;
  const a = createSupabaseAdmin();

  const { data: w } = await a.from("Workspace").select("nombre").eq("id", ws).single();
  const { data: m } = await a.from("Membership").select("role").eq("workspaceId", ws).eq("userId", user).maybeSingle();
  if (!w) throw new Error(`despacho ${ws} no encontrado`);
  if (!m) throw new Error("MIGRA_USER no es miembro de ese despacho");
  const despacho = (w as { nombre: string }).nombre;
  console.log(`Despacho «${despacho}» · importa ${user} (${(m as { role: string }).role}) · ${entrada.filas.length} filas · ${Math.ceil(entrada.filas.length / PASADA)} pasada(s)`);

  // ── SIMULACIÓN: el mismo motor puro que la ruta, contra la cartera real (lectura) ──
  const filas = aplicarMapeo(entrada.filas.map((f) => f.map((c) => String(c ?? ""))), entrada.mapeo);
  aplicarOverrides(filas, entrada.overrides);
  marcarMismaPersona(filas);
  const leer = async <T,>(tabla: string, cols: string): Promise<T[]> => {
    const out: T[] = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await a.from(tabla).select(cols).eq("workspaceId", ws).order("id").range(d, d + 999);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) return out;
    }
  };
  const existentes = await leer<{ id: string } & ClienteFicha>("Cliente", `id, ${FICHA_KEYS.join(", ")}`);
  const refsHist = new Set((await leer<{ referencia: string | null }>("ServicioHistorico", "referencia")).map((h) => h.referencia).filter(Boolean));
  const indice = crearIndicePersonas<string>();
  for (const c of existentes) indice.añadir(c.id, c);

  const grupos = new Map<number, number[]>();
  filas.forEach((f, i) => { if (!f.excluir && f.ficha.nombre?.trim()) grupos.set(f.mismaQue ?? i, [...(grupos.get(f.mismaQue ?? i) ?? []), i]); });
  let nuevas = 0, yaEstan = 0, dudosas = 0, conRenovacion = 0;
  for (const [, idx] of grupos) {
    const { coincide, choca } = indice.buscar(fusionarFichas(idx.map((k) => filas[k].ficha)));
    if (coincide) yaEstan++; else { nuevas++; if (choca) dudosas++; }
    if (caducidadDeGrupo(idx.map((k) => filas[k]))) conRenovacion++;
  }
  const conServicio = filas.filter((f) => !f.excluir && f.servicio && !f.enCurso && (f.ficha.nombre?.trim() || f.empresa.trim()));
  const yaEnHistorial = conServicio.filter((f) => (f.referencia || f.numeroOficial) && refsHist.has(f.referencia || f.numeroOficial)).length;
  const deEmpresa = conServicio.filter((f) => !f.ficha.nombre?.trim()).length;
  const enCurso = filas.filter((f) => !f.excluir && f.enCurso).length;
  const descartadas = filas.filter((f) => f.excluir || (!f.ficha.nombre?.trim() && !(f.empresa.trim() && f.servicio))).length;
  const avisos = new Map<string, number>();
  for (const f of filas) for (const x of f.avisos) if (x !== "Fila sin nombre") { const k = x.replace(/\d+/g, "N").replace(/«[^»]*»/g, "«…»"); avisos.set(k, (avisos.get(k) ?? 0) + 1); }
  const sinServicio = [...new Set(filas.flatMap((f) => f.avisos.filter((x) => x.startsWith("Trámite sin mapear"))))];

  console.log("\nSIMULACIÓN (nada escrito)");
  console.log(`  personas en el archivo: ${grupos.size} → nuevas ${nuevas} · ya en el despacho ${yaEstan} (se completan, nunca se pisan) · dudosas frente a la cartera (mismo nombre, otros datos: se crean aparte) ${dudosas}`);
  console.log(`  filas de una persona ya vista: ${filas.filter((f) => f.mismaQue != null).length} (sus servicios se suman a su ficha)`);
  console.log(`  servicios al historial: ${conServicio.length} (de ellos ${yaEnHistorial} ya están por su referencia · ${deEmpresa} de empresas sin persona)`);
  console.log(`  expedientes en curso: ${enCurso} · personas con renovación: ${conRenovacion} · filas descartadas: ${descartadas}`);
  if (sinServicio.length) console.log(`  ⚠ trámites SIN servicio del catálogo (${sinServicio.length}): ${sinServicio.slice(0, 12).map((x) => x.replace("Trámite sin mapear: ", "")).join(" · ")}`);
  if (avisos.size) { console.log("  avisos por tipo:"); for (const [k, n] of [...avisos].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`    ${String(n).padStart(4)} × ${k}`); }

  if (process.env.MIGRA_CONFIRMAR !== "si") { console.log("\n(simulación: para importar, MIGRA_CONFIRMAR=si + MIGRA_DESPACHO + MIGRA_SALIDA)"); return; }

  // ── IMPORT ──
  if (process.env.MIGRA_DESPACHO !== despacho) throw new Error(`MIGRA_DESPACHO no coincide con el nombre del despacho («${despacho}»): no se escribe nada`);
  const salida = process.env.MIGRA_SALIDA ?? "";
  if (!salida) throw new Error("falta MIGRA_SALIDA (carpeta de la migración, fuera del repositorio)");
  mkdirSync(salida, { recursive: true });
  const antes = await tomarFoto(a, ws);
  console.log(`\nfoto antes: ${resumenFoto(antes)} → ${guardarFoto(antes, salida, "foto-antes")}`);
  const { POST } = await import("@/app/api/importar/ejecutar/route");
  const registro: unknown[] = [];
  for (let p = 0; p * PASADA < entrada.filas.length; p++) {
    // Las correcciones van por índice de fila: se reindexan a la pasada.
    const desde = p * PASADA;
    const overrides = Object.fromEntries(Object.entries(entrada.overrides ?? {}).filter(([k]) => Number(k) >= desde && Number(k) < desde + PASADA).map(([k, v]) => [String(Number(k) - desde), v]));
    const body = { filas: [entrada.cabecera, ...entrada.filas.slice(desde, desde + PASADA)], mapeo: JSON.parse(JSON.stringify(entrada.mapeo)), primeraFilaEsCabecera: true, overrides, oficinaId: entrada.oficinaId ?? null };
    const res = await POST(new Request("http://migracion.local/api/importar/ejecutar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const r = await res.json();
    registro.push({ pasada: p + 1, http: res.status, ...r });
    console.log(`pasada ${p + 1} → HTTP ${res.status} · ${JSON.stringify({ ...r, avisos: undefined })}`);
    for (const x of (r.avisos ?? []) as string[]) console.log("   aviso:", x);
    if (res.status !== 200) { console.log("✗ pasada fallida: se detiene (lo ya escrito queda en la foto de después)"); break; }
  }
  const despues = await tomarFoto(a, ws);
  console.log(`foto después: ${resumenFoto(despues)} → ${guardarFoto(despues, salida, "foto-despues")}`);
  const ruta = `${salida}/registro-${despues.fecha.replace(/[:.]/g, "-")}.json`;
  writeFileSync(ruta, JSON.stringify({ despacho, workspaceId: ws, archivo, registro }, null, 1));
  console.log(`registro: ${ruta}\nSiguiente paso: verificar.ts (fase 8).`);
})().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
