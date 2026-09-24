// E2E — Nº de expediente OFICIAL + import (23/09/2026). SOLO sobre la DEMO. Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-numero-oficial.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j, txt };
};
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const now = () => new Date().toISOString();

try {
  const { data: ofs } = await admin.from("Oficina").select("id").eq("workspaceId", WS).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  const { data: svs } = await admin.from("ServicioConfig").select("clave, label").eq("workspaceId", WS).limit(80);
  const sv = (svs ?? []).find((x) => x.clave === "arraigo_social") ?? (svs ?? []).find((x) => /arraigo/i.test(x.label ?? "")) ?? svs?.[0];

  console.log("\n1. El campo: guardar, rastro, ficha, fila de la lista, borrar");
  const cliId = crypto.randomUUID(), expId = crypto.randomUUID();
  await admin.from("Cliente").insert({ id: cliId, workspaceId: WS, nombre: "ZZNUM", apellidos: "Existente", numeroDocumento: "Z9990001A", updatedAt: now(), ...(sede ? { oficinaId: sede } : {}) });
  await admin.from("Expediente").insert({ id: expId, workspaceId: WS, clienteId: cliId, referencia: `ZZNUM-${Date.now()}`, portalToken: crypto.randomUUID().replace(/-/g, ""), tipo: "OTRO", servicioClave: sv.clave, estado: "EN_PREPARACION", updatedAt: now(), ...(sede ? { oficinaId: sede } : {}) });
  let r = await api(`/api/expedientes/${expId}/numero-oficial`, { method: "PATCH", body: JSON.stringify({ numeroOficial: "  08/555555/2026 " }) });
  const { data: e1 } = await admin.from("Expediente").select("numeroOficial").eq("id", expId).maybeSingle();
  check("PATCH guarda el número limpio", r.status === 200 && e1?.numeroOficial === "08/555555/2026", JSON.stringify({ r: r.j, e1 }));
  const { data: ev1 } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", expId);
  check("deja rastro en el historial", (ev1 ?? []).some((x) => /Nº de expediente de Extranjería: 08\/555555\/2026/.test(x.descripcion)));
  const ficha = await (await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { Cookie: cookies } })).text();
  check("la ficha lo enseña en la cabecera", ficha.includes("08/555555/2026") && /Nº expediente \(Extranjería\)/.test(ficha));
  // 24/09/2026: sin vista Tabla — el número vive en la FILA de la lista (y la ruta de la tabla ya no existe).
  const lista = await (await fetch(`${BASE}/app/expedientes`, { headers: { Cookie: cookies } })).text();
  check("la fila de la lista lo enseña", lista.includes("08/555555/2026") && !lista.includes('aria-label="Presentación"'));
  // «tabla» cae ahora en /api/expedientes/[id], que no tiene GET → 405 (antes: 200 con las filas).
  const viejaTabla = (await api("/api/expedientes/tabla")).status;
  check("la ruta de la antigua tabla ya no existe", [404, 405].includes(viejaTabla), String(viejaTabla));
  r = await api(`/api/expedientes/${expId}/numero-oficial`, { method: "PATCH", body: JSON.stringify({ numeroOficial: "08/555555/2026" }) });
  check("el mismo valor → sin cambios, sin evento nuevo", r.j.sinCambios === true);
  r = await api(`/api/expedientes/${expId}/numero-oficial`, { method: "PATCH", body: JSON.stringify({ numeroOficial: "" }) });
  const { data: e2 } = await admin.from("Expediente").select("numeroOficial").eq("id", expId).maybeSingle();
  check("vaciarlo lo borra y lo apunta", r.status === 200 && e2?.numeroOficial === null);
  const sin = await fetch(`${BASE}/api/expedientes/${expId}/numero-oficial`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("sin sesión → 401", sin.status === 401, String(sin.status));
  r = await api(`/api/expedientes/${crypto.randomUUID()}/numero-oficial`, { method: "PATCH", body: JSON.stringify({ numeroOficial: "X" }) });
  check("expediente ajeno → 404", r.status === 404, String(r.status));

  console.log("\n2. La IA distingue el nº oficial de la referencia interna (1 lectura real)");
  const csv = "Nombre completo;NIE;Nº expediente;Trámite;Estado;Ref. interna\nZZNUM Ana Ruiz;Z9990002B;08/123456/2026;Arraigo social;En preparación;2024-118\nZZNUM Karim Benali;Z9990003C;BA/0045/2025;Arraigo social;Resuelto;2024-119\n";
  const fd = new FormData(); fd.set("file", new File([csv], "cartera.csv", { type: "text/csv" }));
  const an = await fetch(`${BASE}/api/importar/analizar`, { method: "POST", body: fd, headers: { Cookie: cookies } });
  const anj = await an.json().catch(() => ({}));
  const campoDe = (i) => anj?.propuesta?.columnas?.find?.((c) => c.indice === i)?.campo;
  check("«Nº expediente» → numeroOficial", an.status === 200 && campoDe(2) === "numeroOficial", JSON.stringify(anj?.propuesta?.columnas));
  check("«Ref. interna» → referencia (no se confunden)", campoDe(5) === "referencia", String(campoDe(5)));

  console.log("\n3. Ejecutar: expediente nuevo, número completado en uno existente, servicio pasado");
  const mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "numeroDocumento" }, { indice: 2, campo: "numeroOficial" }, { indice: 3, campo: "tramite" }, { indice: 4, campo: "estado" }],
    tramites: { "Arraigo social": sv.clave }, validezMeses: {}, estados: { "En preparación": "EN_PREPARACION", "Resuelto": "RESUELTO" },
    crearHistorial: true, crearFamilias: false, crearEnCurso: true, primeraFilaEsCabecera: false,
  };
  const filas = [
    ["ZZNUM Nuevo Diallo", "Z9990004D", "08/111111/2026", "Arraigo social", "En preparación"],
    ["ZZNUM Existente", "Z9990001A", "08/777777/2026", "Arraigo social", "En preparación"],
    ["ZZNUM Pasado Khan", "Z9990005E", "08/222222/2025", "Arraigo social", "Resuelto"],
  ];
  r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas, mapeo, primeraFilaEsCabecera: false, ...(sede ? { oficinaId: sede } : {}) }) });
  check("ejecutar → 200, 1 expediente nuevo, 1 ya abierto, 1 servicio en el historial", r.status === 200 && r.j.expedientesCreados === 1 && r.j.expedientesOmitidos === 1 && r.j.serviciosCreados === 1, JSON.stringify(r.j).slice(0, 260));
  const { data: nuevoCli } = await admin.from("Cliente").select("id").eq("workspaceId", WS).eq("numeroDocumento", "Z9990004D").maybeSingle();
  const { data: nuevoExp } = await admin.from("Expediente").select("numeroOficial").eq("clienteId", nuevoCli?.id ?? "-").maybeSingle();
  check("el expediente nuevo nace con su nº oficial", nuevoExp?.numeroOficial === "08/111111/2026", JSON.stringify(nuevoExp));
  const { data: exist } = await admin.from("Expediente").select("numeroOficial").eq("id", expId).maybeSingle();
  check("el que ya existía recibe el número del Excel", exist?.numeroOficial === "08/777777/2026", JSON.stringify(exist));
  check("…y el gestor lo ve en el resumen", (r.j.avisos ?? []).some((a) => /añadidos a expedientes que ya existían/.test(a)), JSON.stringify(r.j.avisos));
  const { data: pasadoCli } = await admin.from("Cliente").select("id").eq("workspaceId", WS).eq("numeroDocumento", "Z9990005E").maybeSingle();
  const { data: hist } = await admin.from("ServicioHistorico").select("referencia").eq("clienteId", pasadoCli?.id ?? "-");
  check("el servicio pasado guarda el número como referencia", (hist ?? []).some((h) => h.referencia === "08/222222/2025"), JSON.stringify(hist));

  console.log("\n4. Reimportar el mismo archivo: nada se duplica, nada se pisa");
  await admin.from("Expediente").update({ numeroOficial: "08/999999/2026" }).eq("id", expId); // el gestor lo corrigió a mano
  r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas, mapeo, primeraFilaEsCabecera: false, ...(sede ? { oficinaId: sede } : {}) }) });
  check("0 expedientes y 0 servicios nuevos", r.status === 200 && r.j.expedientesCreados === 0 && r.j.serviciosCreados === 0, JSON.stringify(r.j).slice(0, 200));
  const { data: exist2 } = await admin.from("Expediente").select("numeroOficial").eq("id", expId).maybeSingle();
  check("un número ya puesto NO se pisa", exist2?.numeroOficial === "08/999999/2026", JSON.stringify(exist2));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  const { data: cls } = await admin.from("Cliente").select("id").eq("workspaceId", WS).like("nombre", "ZZNUM%");
  const ids = (cls ?? []).map((c) => c.id);
  if (ids.length) {
    await admin.from("ServicioHistorico").delete().in("clienteId", ids);
    await admin.from("Vencimiento").delete().in("clienteId", ids);
    await admin.from("Expediente").delete().in("clienteId", ids);
    await admin.from("Cliente").delete().in("id", ids);
  }
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS).like("nombre", "ZZNUM%");
  console.log(`\nlimpieza: ${ids.length} clientes (+ expedientes, servicios, vencimientos) · restos ZZNUM: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
