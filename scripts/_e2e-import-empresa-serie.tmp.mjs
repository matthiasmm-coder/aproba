// E2E — columna «empresa» en la migración + arranque de serie de facturas (Luis, 21/09/2026).
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-import-empresa-serie.tmp.mjs <cookies.json>
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
const quemados = [];
let prefijoTemporal = null;
const EMPRESA = "ZZE2E Talleres Ebro S.L.";

try {
  const { data: ofs } = await admin.from("Oficina").select("id, nombre, prefijoSerie").eq("workspaceId", WS_DEMO).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  const { data: svs } = await admin.from("ServicioConfig").select("clave, label").eq("workspaceId", WS_DEMO).limit(60);
  const sv = (svs ?? []).find((x) => /arraigo/i.test(x.label ?? "")) ?? (svs ?? [])[0];

  // ── A. Importación con columna empresa ──
  console.log("\nA1. Importar 3 filas: 2 trabajadores de la misma empresa (escrita con espacios distintos) + 1 particular");
  const mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "pasaporte" }, { indice: 2, campo: "empresa" }, { indice: 3, campo: "tramite" }, { indice: 4, campo: "estado" }],
    tramites: { "Arraigo": sv?.clave ?? null }, validezMeses: {}, estados: { "En preparación": "EN_PREPARACION" },
    crearHistorial: false, crearFamilias: false, crearEnCurso: true, primeraFilaEsCabecera: false,
  };
  const filas = [
    ["ZZE2E Amadou Ba", "ZZP0001", EMPRESA, "Arraigo", "En preparación"],
    ["ZZE2E Fatima Benali", "ZZP0002", "  zze2e   talleres ebro s.l. ", "", ""],
    ["ZZE2E Karim Solo", "ZZP0003", "", "", ""],
  ];
  let r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas, mapeo, primeraFilaEsCabecera: false, ...(sede ? { oficinaId: sede } : {}) }) });
  check("ejecutar → 200, 3 clientes, 1 empresa, 1 expediente en curso", r.status === 200 && r.j.clientesCreados === 3 && r.j.empresas === 1 && r.j.expedientesCreados === 1, JSON.stringify(r.j).slice(0, 220));
  const { data: ems } = await admin.from("Empresa").select("id, razonSocial, oficinaId").eq("workspaceId", WS_DEMO).ilike("razonSocial", "ZZE2E%");
  check("una sola Empresa, con la razón social limpia", ems?.length === 1 && ems[0].razonSocial === EMPRESA, JSON.stringify(ems));
  const empId = ems?.[0]?.id;
  check("la empresa hereda la sede del import", !sede || ems?.[0]?.oficinaId === sede, String(ems?.[0]?.oficinaId));
  // partirNombreCompleto pone la 1.ª palabra en nombre («ZZE2E») → se identifica por pasaporte.
  const { data: cls } = await admin.from("Cliente").select("id, nombre, apellidos, pasaporte, empresaId").eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  const byN = Object.fromEntries((cls ?? []).map((c) => [c.pasaporte, c]));
  check("Amadou y Fatima vinculados a la empresa; Karim sin empresa", byN.ZZP0001?.empresaId === empId && byN.ZZP0002?.empresaId === empId && byN.ZZP0003?.empresaId === null, JSON.stringify(cls));
  const { data: exps } = await admin.from("Expediente").select("id, clienteId, empresaId, modoTrabajo, estado").eq("workspaceId", WS_DEMO).in("clienteId", (cls ?? []).map((c) => c.id));
  check("el expediente en curso de Amadou lleva el sello de la empresa (titular = trabajador, modo manual)", exps?.length === 1 && exps[0].clienteId === byN.ZZP0001?.id && exps[0].empresaId === empId && exps[0].modoTrabajo === "MANUAL", JSON.stringify(exps));
  if (exps?.[0]) {
    const { data: evs } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", exps[0].id).eq("tipo", "CREADO");
    check("el evento CREADO menciona la empresa", (evs ?? []).some((e) => e.descripcion.includes(`empresa ${EMPRESA}`)), JSON.stringify(evs));
  }

  console.log("\nA2. Reimportar el mismo archivo: nada se duplica");
  r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas, mapeo, primeraFilaEsCabecera: false, ...(sede ? { oficinaId: sede } : {}) }) });
  check("0 clientes nuevos, 0 empresas nuevas, 0 expedientes nuevos (1 ya abierto)", r.status === 200 && r.j.clientesCreados === 0 && r.j.empresas === 0 && r.j.expedientesCreados === 0 && r.j.expedientesOmitidos === 1, JSON.stringify(r.j).slice(0, 220));
  const { count: nE } = await admin.from("Empresa").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).ilike("razonSocial", "ZZE2E%");
  check("sigue habiendo UNA empresa", nE === 1, String(nE));

  console.log("\nA3. Un cliente que ya tenía OTRA empresa no cambia de empresa");
  const { data: otra } = await admin.from("Empresa").insert({ id: crypto.randomUUID(), workspaceId: WS_DEMO, razonSocial: "ZZE2E Otra S.L.", updatedAt: new Date().toISOString() }).select("id").single();
  await admin.from("Cliente").update({ empresaId: otra.id }).eq("id", byN.ZZP0003.id);
  r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas: [["ZZE2E Karim Solo", "ZZP0003", EMPRESA, "", ""]], mapeo, primeraFilaEsCabecera: false }) });
  const { data: karim } = await admin.from("Cliente").select("empresaId").eq("id", byN.ZZP0003.id).maybeSingle();
  check("Karim conserva su empresa anterior", r.status === 200 && karim?.empresaId === otra.id, JSON.stringify({ r: r.j, karim }));

  console.log("\nA4. La pantalla de importación ofrece la columna");
  // El selector de columnas se pinta tras el análisis (cliente): se busca la etiqueta en los chunks JS de la página.
  const html = await (await fetch(`${BASE}/app/importar`, { headers: { Cookie: cookies } })).text();
  const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
  let enChunk = false;
  // El bundle escapa la ó («raz\xf3n»): se acepta cualquiera de las tres formas.
  const re = /Empresa \(raz(?:ón|\\xf3|\\u00f3)n social\)/;
  for (const c of chunks) { const js = await (await fetch(`${BASE}${c}`)).text(); if (re.test(js)) { enChunk = true; break; } }
  check(`el selector de columnas lista «Empresa (razón social)» (${chunks.length} chunks)`, enChunk);

  console.log("\nA5. La IA propone la columna «Empresa» al analizar un CSV (1 llamada)");
  const csv = "Nombre completo,Pasaporte,Empresa,Trámite,Estado\nZZE2E Amadou Ba,ZZP0001,Talleres Ebro S.L.,Arraigo social,En preparación\nZZE2E Fatima Benali,ZZP0002,Talleres Ebro S.L.,Renovación,Terminado\n";
  const fd = new FormData(); fd.set("file", new File([csv], "trabajadores.csv", { type: "text/csv" }));
  const an = await fetch(`${BASE}/api/importar/analizar`, { method: "POST", body: fd, headers: { Cookie: cookies } });
  const anj = await an.json().catch(() => ({}));
  const colEmpresa = anj?.propuesta?.columnas?.find?.((c) => c.indice === 2)?.campo; // la respuesta lleva la propuesta en `propuesta`
  check("analizar → 200 y la columna 2 se mapea a «empresa»", an.status === 200 && colEmpresa === "empresa", `${an.status} columnas=${JSON.stringify(anj?.propuesta?.columnas)}`);

  // ── B. Arranque de serie ──
  console.log("\nB1. Serie común del despacho");
  const year = new Date().getFullYear();
  const pad = (n) => String(n).padStart(4, "0");
  r = await api("/api/facturas/numero");
  const sigAntes = r.j.numero; const max = Number(String(sigAntes).split("-").pop()) - 1;
  check("GET devuelve la siguiente de la serie común", r.status === 200 && /^\d{4}-\d{4}$/.test(sigAntes ?? ""), JSON.stringify(r.j));
  if (max >= 2) { r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: String(max - 1) }) }); check("retroceder → 409 con explicación", r.status === 409 && /solo avanza/.test(r.j.error ?? ""), JSON.stringify(r.j)); }
  if (max >= 1) { r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: String(max) }) }); check("el mismo máximo → 200 sin cambios", r.status === 200 && r.j.sinCambios === true, JSON.stringify(r.j)); }
  r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: `${year}-${pad(max + 50)}` }) });
  check("fijar el último nº emitido fuera → la siguiente es +1", r.status === 200 && r.j.siguiente === `${year}-${pad(max + 51)}`, JSON.stringify(r.j));
  if (r.j.ultimo) quemados.push(r.j.ultimo);
  r = await api("/api/facturas/numero");
  check("GET confirma la nueva siguiente", r.j.numero === `${year}-${pad(max + 51)}`, JSON.stringify(r.j));
  r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: `${year - 1}-0001` }) });
  check("otro año → 400", r.status === 400, JSON.stringify(r.j));
  r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: "hola" }) });
  check("texto raro → 400", r.status === 400, JSON.stringify(r.j));
  r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ ultimo: String(max + 50) }) });
  check("repetir el mismo último → 200 sin cambios (idempotente)", r.status === 200 && r.j.sinCambios === true, JSON.stringify(r.j));

  console.log("\nB2. Serie de una oficina");
  const sinPrefijo = (ofs ?? []).find((o) => !o.prefijoSerie);
  if (sinPrefijo) { r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ oficinaId: sinPrefijo.id, ultimo: "5" }) }); check("oficina sin prefijo → 409 (usa la serie común)", r.status === 409, JSON.stringify(r.j)); }
  // La demo no tiene sede con prefijo: se pone «ZZ» en una sede secundaria SOLO durante la sonda (se restaura en finally).
  let conPrefijo = (ofs ?? []).find((o) => o.prefijoSerie);
  if (!conPrefijo && (ofs ?? []).length > 1) {
    const { data: sec } = await admin.from("Oficina").select("id, nombre, orden").eq("workspaceId", WS_DEMO).neq("orden", -1).order("orden").limit(1).maybeSingle();
    if (sec) { await admin.from("Oficina").update({ prefijoSerie: "ZZ" }).eq("id", sec.id); prefijoTemporal = sec.id; conPrefijo = { ...sec, prefijoSerie: "ZZ" }; }
  }
  if (conPrefijo) {
    const p = conPrefijo.prefijoSerie.toUpperCase();
    r = await api(`/api/facturas/numero?oficina=${conPrefijo.id}`); const maxO = Number(String(r.j.numero).split("-").pop()) - 1;
    r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ oficinaId: conPrefijo.id, ultimo: String(maxO + 20) }) });
    check(`oficina ${p}: fijar → siguiente ${p}-${year}-${pad(maxO + 21)}`, r.status === 200 && r.j.siguiente === `${p}-${year}-${pad(maxO + 21)}`, JSON.stringify(r.j));
    if (r.j.ultimo) quemados.push(r.j.ultimo);
    r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ oficinaId: conPrefijo.id, ultimo: `XX-${year}-0001` }) });
    check("prefijo ajeno → 400", r.status === 400, JSON.stringify(r.j));
    r = await api("/api/facturas/numero");
    check("la serie común NO se mueve al fijar la de la oficina", r.j.numero === `${year}-${pad(max + 51)}`, JSON.stringify(r.j));
  } else console.log("  (la demo no tiene oficina con prefijo: se omite)");
  r = await api("/api/facturas/numero", { method: "POST", body: JSON.stringify({ oficinaId: crypto.randomUUID(), ultimo: "5" }) });
  check("oficina inexistente → 404", r.status === 404, JSON.stringify(r.j));

  console.log("\nB3. Ajustes muestra el bloque");
  const aj = await (await fetch(`${BASE}/app/ajustes`, { headers: { Cookie: cookies } })).text();
  check("Ajustes › Facturación contiene «Numeración de la serie» y «La serie continúa desde el nº»", (aj.includes("Numeración de la serie") || aj.includes("Numeració de la sèrie")) && (aj.includes("La serie continúa desde el nº") || aj.includes("La sèrie continua des del núm.")));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  const { data: cls } = await admin.from("Cliente").select("id").eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  const ids = (cls ?? []).map((c) => c.id);
  if (ids.length) { await admin.from("Expediente").delete().in("clienteId", ids); await admin.from("Cliente").delete().in("id", ids); }
  await admin.from("Empresa").delete().eq("workspaceId", WS_DEMO).ilike("razonSocial", "ZZE2E%");
  for (const n of quemados) await admin.from("FacturaNumeroQuemado").delete().eq("workspaceId", WS_DEMO).eq("numero", n);
  if (prefijoTemporal) { await admin.from("Oficina").update({ prefijoSerie: null }).eq("id", prefijoTemporal); console.log("prefijo temporal ZZ retirado de la sede", prefijoTemporal); }
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  const { count: nEmp } = await admin.from("Empresa").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).ilike("razonSocial", "ZZE2E%");
  console.log(`\nlimpieza: ${ids.length} clientes (+ sus expedientes), empresas ZZE2E restantes ${nEmp}, quemados retirados ${quemados.length} · restos ZZE2E: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
