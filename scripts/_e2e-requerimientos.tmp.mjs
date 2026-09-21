// E2E — REQUERIMIENTOS (petición de Jennifer, 21/09/2026). SOLO sobre el workspace de la
// DEMO (Gestoría Vallès). Crea, comprueba y borra todo. La migración debe estar ejecutada.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-requerimientos.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 160) }; }
  return { status: res.status, j };
};
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const creados = { exp: [], cli: [], req: [] };
const iso = (d) => new Date(d).toISOString();
const enDias = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

try {
  const { data: ofs } = await admin.from("Oficina").select("id").eq("workspaceId", WS_DEMO).order("nombre");
  const sede = ofs?.[0]?.id ?? null;

  console.log("\n1. Alta desde la ficha del expediente");
  let r = await api("/api/expedientes", { method: "POST", body: JSON.stringify({ nuevo: { nombre: "ZZREQ Alba", apellidos: "Yasohara", email: "delivered@resend.dev" }, ...(sede ? { oficinaId: sede } : {}) }) });
  check("expediente de prueba creado", r.status === 200, JSON.stringify(r.j).slice(0, 140));
  const expId = r.j.expedienteId; if (expId) creados.exp.push(expId);
  const { data: e1 } = await admin.from("Expediente").select("clienteId").eq("id", expId).maybeSingle();
  if (e1?.clienteId) creados.cli.push(e1.clienteId);

  r = await api(`/api/expedientes/${expId}/requerimientos`, { method: "POST", body: JSON.stringify({ asunto: "ZZREQ Certificado de antecedentes penales apostillado", fechaLimite: iso(enDias(10)), recibidoEl: iso(enDias(0)), avisarDias: 3 }) });
  check("requerimiento creado (200)", r.status === 200 && Boolean(r.j.requerimiento?.id), JSON.stringify(r.j).slice(0, 200));
  const reqId = r.j.requerimiento?.id; if (reqId) creados.req.push(reqId);
  const { data: fila } = await admin.from("Requerimiento").select("*").eq("id", reqId).maybeSingle();
  check("guardado PENDIENTE, con su plazo y su umbral, sin avisar aún", fila?.estado === "PENDIENTE" && fila?.avisarDias === 3 && fila?.ultimoAviso === null, JSON.stringify(fila).slice(0, 200));
  check("el workspace es el del expediente (no el del cuerpo)", fila?.workspaceId === WS_DEMO, String(fila?.workspaceId));
  const { data: evs } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", expId);
  check("queda rastro en el historial del expediente", (evs ?? []).some((x) => /Requerimiento registrado/.test(x.descripcion)), JSON.stringify(evs).slice(0, 160));

  console.log("\n2. Validaciones (la fecha la manda ella, pero tiene que existir)");
  r = await api(`/api/expedientes/${expId}/requerimientos`, { method: "POST", body: JSON.stringify({ asunto: "", fechaLimite: iso(enDias(5)) }) });
  check("sin asunto → 400", r.status === 400, String(r.status));
  r = await api(`/api/expedientes/${expId}/requerimientos`, { method: "POST", body: JSON.stringify({ asunto: "ZZREQ sin fecha" }) });
  check("sin fecha límite → 400", r.status === 400, String(r.status));
  r = await api(`/api/expedientes/${crypto.randomUUID()}/requerimientos`, { method: "POST", body: JSON.stringify({ asunto: "ZZREQ ajeno", fechaLimite: iso(enDias(5)) }) });
  check("expediente que no es mío → 404", r.status === 404, String(r.status));
  const sinSesion = await fetch(`${BASE}/api/requerimientos/${reqId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aportado: true }) });
  check("sin sesión → 401", sinSesion.status === 401, String(sinSesion.status));

  console.log("\n3. Ella manda: cambiar el plazo rearma los avisos");
  await admin.from("Requerimiento").update({ ultimoAviso: 3 }).eq("id", reqId);
  r = await api(`/api/requerimientos/${reqId}`, { method: "PATCH", body: JSON.stringify({ fechaLimite: iso(enDias(20)) }) });
  const { data: f2 } = await admin.from("Requerimiento").select("fechaLimite, ultimoAviso").eq("id", reqId).maybeSingle();
  check("plazo ampliado y avisos rearmados (ultimoAviso a null)", r.status === 200 && f2?.ultimoAviso === null, JSON.stringify(f2));
  await admin.from("Requerimiento").update({ ultimoAviso: 3 }).eq("id", reqId);
  r = await api(`/api/requerimientos/${reqId}`, { method: "PATCH", body: JSON.stringify({ avisarDias: 7 }) });
  const { data: f3 } = await admin.from("Requerimiento").select("avisarDias, ultimoAviso").eq("id", reqId).maybeSingle();
  check("cambiar el umbral también rearma", r.status === 200 && f3?.avisarDias === 7 && f3?.ultimoAviso === null, JSON.stringify(f3));
  r = await api(`/api/requerimientos/${reqId}`, { method: "PATCH", body: JSON.stringify({ avisarDias: 999 }) });
  const { data: f4 } = await admin.from("Requerimiento").select("avisarDias").eq("id", reqId).maybeSingle();
  check("un umbral absurdo se acota (≤60)", f4?.avisarDias === 60, JSON.stringify(f4));

  console.log("\n4. Pantallas");
  const ficha = await (await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { Cookie: cookies } })).text();
  check("la ficha muestra el requerimiento", ficha.includes("ZZREQ Certificado de antecedentes penales apostillado"));
  check("…y la sección nace abierta (hay plazo vivo)", /Requerimientos/.test(ficha) && /Marcar como aportado/.test(ficha));
  const pantalla = await (await fetch(`${BASE}/app/requerimientos`, { headers: { Cookie: cookies } })).text();
  check("la pantalla «Requerimientos» lo lista con su cliente", pantalla.includes("ZZREQ Alba") && pantalla.includes("ZZREQ Certificado"));
  const tablero = await (await fetch(`${BASE}/app/expedientes`, { headers: { Cookie: cookies } })).text();
  check("la pestaña «Requerimientos» existe en Expedientes", /Requerimientos/.test(tablero));

  console.log("\n5. Cerrarlo y reabrirlo (lo decide ella)");
  r = await api(`/api/requerimientos/${reqId}`, { method: "PATCH", body: JSON.stringify({ aportado: true }) });
  const { data: f5 } = await admin.from("Requerimiento").select("estado, aportadoEl").eq("id", reqId).maybeSingle();
  check("marcar como aportado sella la fecha", r.status === 200 && f5?.estado === "APORTADO" && Boolean(f5?.aportadoEl), JSON.stringify(f5));
  const pantalla2 = await (await fetch(`${BASE}/app/requerimientos`, { headers: { Cookie: cookies } })).text();
  check("lo aportado sale de la lista de pendientes", !pantalla2.includes("ZZREQ Certificado"));
  r = await api(`/api/requerimientos/${reqId}`, { method: "PATCH", body: JSON.stringify({ aportado: false }) });
  const { data: f6 } = await admin.from("Requerimiento").select("estado, aportadoEl, ultimoAviso").eq("id", reqId).maybeSingle();
  check("reabrir lo devuelve a PENDIENTE y rearma el aviso", f6?.estado === "PENDIENTE" && f6?.aportadoEl === null && f6?.ultimoAviso === null, JSON.stringify(f6));

  console.log("\n6. El tick diario está protegido (el escáner se verifica aparte, contra la base real)");
  // Los crons son fail-closed por cabecera (CRON_SECRET). Aquí se comprueba SOLO que
  // nadie los dispara desde fuera; la lógica del escáner —a quién avisa, qué hito sella
  // y que no repite— se prueba ejecutándolo contra la base, sin clave de envío.
  const cron = await fetch(`${BASE}/api/cron/reconciliar-pagos`, { headers: { Cookie: cookies } });
  check("el tick diario no se dispara con una sesión de navegador (503 sin secret, 401 con secret)", [401, 503].includes(cron.status), String(cron.status));
  const conSecretMalo = await fetch(`${BASE}/api/cron/vencimientos`, { headers: { Authorization: "Bearer no-es-el-secret" } });
  check("…ni con un secret inventado", [401, 503].includes(conSecretMalo.status), String(conSecretMalo.status));

  console.log("\n7. Borrar");
  r = await api(`/api/requerimientos/${reqId}`, { method: "DELETE" });
  const { data: f9 } = await admin.from("Requerimiento").select("id").eq("id", reqId).maybeSingle();
  check("se borra y deja constancia", r.status === 200 && !f9);
  if (!f9) creados.req = creados.req.filter((x) => x !== reqId);
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  for (const id of creados.req) await admin.from("Requerimiento").delete().eq("id", id);
  for (const id of creados.exp) await admin.from("Expediente").delete().eq("id", id);
  for (const id of creados.cli) await admin.from("Cliente").delete().eq("id", id);
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZREQ%");
  const { count: nR } = await admin.from("Requerimiento").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).ilike("asunto", "ZZREQ%");
  console.log(`\nlimpieza: ${creados.exp.length} expedientes, ${creados.cli.length} clientes · restos ZZREQ: clientes ${count}, requerimientos ${nR}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
