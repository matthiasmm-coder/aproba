// Verifica supabase/historial-resumen.sql EN PRODUCCIÓN, de dos formas:
//   1) con el service_role  → las funciones existen y sus números cuadran con la tabla;
//   2) con la sesión de la cuenta demo → la RLS filtra (solo ve SU archivo).
// Uso: node scripts/probe-historial.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fallos = 0;
const ok = (b, msg, extra = "") => { console.log(`${b ? "✓" : "✗"} ${msg}${extra ? "  " + extra : ""}`); if (!b) fallos++; };

// 1 ── RESUMEN (service_role: ve todos los despachos)
const { data: resumen, error: e1 } = await admin.rpc("historial_resumen", { p_oficinas: null, p_incluir_sin_sede: false });
if (e1) { console.error("✗ historial_resumen:", e1.message); process.exit(1); }
const suma = (resumen ?? []).reduce((a, r) => a + Number(r.n), 0);
const { count } = await admin.from("Expediente").select("id", { count: "exact", head: true }).not("archivadoAt", "is", null);
ok(suma === count, `el resumen cuenta lo mismo que la tabla`, `resumen=${suma} tabla=${count}`);
ok((resumen ?? []).every((r) => /^\d{4}$|^$/.test(r.anio)), "todos los años son un año o vacío");
ok((resumen ?? []).every((r) => ["", "concedido", "denegado", "desistido", "en_tramite"].includes(r.salida)), "las salidas son las del flujo v4");

// 2 ── FILAS de una carpeta concreta: su número debe coincidir con el recuento
const may = [...(resumen ?? [])].sort((a, b) => Number(b.n) - Number(a.n))[0];
if (may) {
  const mismos = (resumen ?? []).filter((r) => r.servicio === may.servicio && r.tipo === may.tipo && r.anio === may.anio);
  const nCarpeta = mismos.reduce((a, r) => a + Number(r.n), 0);
  const { data: filas, error: e2 } = await admin.rpc("historial_filas", {
    p_oficinas: null, p_incluir_sin_sede: false, p_servicio: may.servicio, p_tipo: may.tipo,
    p_anio: may.anio, p_q: null, p_asignado: null, p_salida: null, p_limit: 200, p_offset: 0,
  });
  if (e2) { console.error("✗ historial_filas:", e2.message); process.exit(1); }
  ok((filas ?? []).length === Math.min(nCarpeta, 200), `la carpeta «${may.servicio || may.tipo} · ${may.anio || "sin fecha"}» devuelve sus filas`, `filas=${(filas ?? []).length} recuento=${nCarpeta}`);
  ok((filas ?? []).every((f) => f.anio === may.anio), "todas las filas son del año pedido");
  ok((filas ?? []).every((f) => f.id && f.referencia), "cada fila trae id y referencia");
  const conCliente = (filas ?? []).filter((f) => f.cliente && f.cliente !== "—").length;
  ok(conCliente > 0, "las filas traen el nombre del cliente", `${conCliente}/${(filas ?? []).length}`);
}

// 2 bis ── La fecha de los expedientes presentados ANTES de la columna vive en el
// evento PRESENTADO: el archivo debe enseñarla igual que la ficha.
{
  const { data: viejos } = await admin.from("Expediente")
    .select("id, referencia").is("fechaPresentacion", null).not("archivadoAt", "is", null);
  const ids = (viejos ?? []).map((e) => e.id);
  const { data: evs } = await admin.from("ExpedienteEvento")
    .select("expedienteId, createdAt").eq("tipo", "PRESENTADO").in("expedienteId", ids.length ? ids : ["-"]);
  const conEvento = new Map((evs ?? []).map((e) => [e.expedienteId, e.createdAt]));
  if (conEvento.size === 0) console.log("· (ningún archivado depende del evento PRESENTADO)");
  else {
    const [id, fecha] = [...conEvento.entries()][0];
    const ref = (viejos ?? []).find((e) => e.id === id)?.referencia;
    const { data: fs } = await admin.rpc("historial_filas", {
      p_oficinas: null, p_incluir_sin_sede: false, p_servicio: null, p_tipo: null, p_anio: null,
      p_q: ref, p_asignado: null, p_salida: null, p_limit: 5, p_offset: 0,
    });
    const fila = (fs ?? [])[0];
    const esperado = new Date(fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    ok(Boolean(fila?.presentacion), `${ref}: el archivo recupera la fecha del evento`, `fila=${fila?.presentacion ?? "—"} evento=${esperado}`);
    ok(fila?.anio === esperado.slice(-4), "y su AÑO es el de la presentación, no el del cierre", `anio=${fila?.anio}`);
  }
}

// 3 ── FILTROS
const { data: soloConcedidos } = await admin.rpc("historial_filas", { p_oficinas: null, p_incluir_sin_sede: false, p_servicio: null, p_tipo: null, p_anio: null, p_q: null, p_asignado: null, p_salida: "concedido", p_limit: 50, p_offset: 0 });
ok((soloConcedidos ?? []).every((f) => f.salida === "concedido"), "el filtro de salida solo devuelve esa salida");
const { data: porTexto } = await admin.rpc("historial_filas", { p_oficinas: null, p_incluir_sin_sede: false, p_servicio: null, p_tipo: null, p_anio: null, p_q: "a", p_asignado: null, p_salida: null, p_limit: 5, p_offset: 0 });
ok(Array.isArray(porTexto), "la búsqueda por texto responde");

// 4 ── RLS: con la sesión de la cuenta demo solo se ve SU archivo
const tok = process.env.TOKEN_DEMO;
if (tok) {
  const comoUsuario = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tok}` } },
  });
  const { data: mio, error: e3 } = await comoUsuario.rpc("historial_resumen", { p_oficinas: null, p_incluir_sin_sede: false });
  if (e3) { console.error("✗ historial_resumen bajo sesión:", e3.message); fallos++; }
  else {
    const suyo = (mio ?? []).reduce((a, r) => a + Number(r.n), 0);
    ok(suyo < suma, "bajo sesión se ve MENOS que con service_role (la RLS filtra)", `sesión=${suyo} total=${suma}`);
  }
} else {
  console.log("· (RLS sin comprobar: exporta TOKEN_DEMO con el access_token de la sesión demo)");
}

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
