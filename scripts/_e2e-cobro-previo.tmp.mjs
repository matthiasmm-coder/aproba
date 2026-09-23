// E2E — «Estado del cobro» en la migración (opción A, Luis 24/09/2026).
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Requiere supabase/cobro-previo.sql ejecutada.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-cobro-previo.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}, conSesion = true) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(conSesion ? { Cookie: cookies } : {}), ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 160) }; }
  return { status: res.status, j };
};
const pagina = async (path) => (await fetch(`${BASE}${path}`, { headers: { Cookie: cookies } })).text();
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };

try {
  const { data: svs } = await admin.from("ServicioConfig").select("clave, label").eq("workspaceId", WS_DEMO).limit(60);
  const sv = (svs ?? []).find((x) => /arraigo/i.test(x.label ?? "")) ?? (svs ?? [])[0];
  const mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "pasaporte" }, { indice: 2, campo: "tramite" }, { indice: 3, campo: "estado" }, { indice: 4, campo: "importe" }, { indice: 5, campo: "estadoCobro" }],
    tramites: { Arraigo: sv?.clave ?? null }, validezMeses: { Arraigo: null }, estados: { Resuelto: "RESUELTO", Presentado: "PRESENTADO" },
    crearHistorial: true, crearFamilias: false, crearEnCurso: true, primeraFilaEsCabecera: false,
  };
  const filas = [
    ["ZZCOB Karim Solo", "ZZC0001", "Arraigo", "Resuelto", "390", "Pendiente"],
    ["ZZCOB Ana Paga", "ZZC0002", "Arraigo", "Resuelto", "250 €", "Cobrada"],
    ["ZZCOB Amadou Curso", "ZZC0003", "Arraigo", "Presentado", "150", "Pendiente de cobro"],
    ["ZZCOB Lina Duda", "ZZC0004", "Arraigo", "Resuelto", "100", "transferencia"],
  ];

  console.log("\nA. Importar 4 filas: 2 terminadas (pendiente / cobrada), 1 en curso pendiente, 1 con un valor que no se entiende");
  let r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas, mapeo, primeraFilaEsCabecera: false }) });
  check("ejecutar → 200, 4 clientes, 3 servicios en el historial, 1 expediente en curso", r.status === 200 && r.j.clientesCreados === 4 && r.j.serviciosCreados === 3 && r.j.expedientesCreados === 1, JSON.stringify(r.j).slice(0, 260));
  check("el valor raro deja un aviso en su fila (no se inventa)", (r.j.avisos ?? []).some((a) => /Fila 4: Estado del cobro no reconocido/.test(a)), JSON.stringify(r.j.avisos));
  const { data: cls } = await admin.from("Cliente").select("id, pasaporte").eq("workspaceId", WS_DEMO).like("nombre", "ZZCOB%");
  const cid = Object.fromEntries((cls ?? []).map((c) => [c.pasaporte, c.id]));
  const { data: hs } = await admin.from("ServicioHistorico").select("id, clienteId, importe, cobro").in("clienteId", Object.values(cid));
  const h = Object.fromEntries((hs ?? []).map((x) => [Object.keys(cid).find((k) => cid[k] === x.clienteId), x]));
  check("Karim: 390 € · PENDIENTE", Number(h.ZZC0001?.importe) === 390 && h.ZZC0001?.cobro === "PENDIENTE", JSON.stringify(h.ZZC0001));
  check("Ana: 250 € · COBRADA", Number(h.ZZC0002?.importe) === 250 && h.ZZC0002?.cobro === "COBRADA", JSON.stringify(h.ZZC0002));
  check("Lina: importe guardado, cobro vacío", Number(h.ZZC0004?.importe) === 100 && h.ZZC0004?.cobro === null, JSON.stringify(h.ZZC0004));
  const { data: exps } = await admin.from("Expediente").select("id, importePrevio, cobroPrevio, estado").eq("clienteId", cid.ZZC0003);
  const exp = exps?.[0];
  check("Amadou: expediente en curso con 150 € facturados antes de Aproba, PENDIENTE", exps?.length === 1 && Number(exp.importePrevio) === 150 && exp.cobroPrevio === "PENDIENTE", JSON.stringify(exps));
  const { data: evs } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", exp?.id ?? "-");
  check("su historial lo apunta («Facturado antes de Aproba: 150,00 € · pendiente de cobro»)", (evs ?? []).some((e) => e.descripcion.includes("Facturado antes de Aproba: 150,00 € · pendiente de cobro")), JSON.stringify(evs?.map((e) => e.descripcion)));

  console.log("\nB. Pantallas");
  const fact = await pagina("/app/facturas");
  check("Facturas › Cobros pendientes lista a Karim y a Amadou (anteriores a Aproba)", fact.includes("ZZCOB Karim Solo") && fact.includes("ZZCOB Amadou Curso"));
  check("…y no a Ana (cobrada)", !fact.includes("ZZCOB Ana Paga"));
  const fichaExp = await pagina(`/app/expedientes/${exp?.id}`);
  check("la ficha del expediente enseña «Facturado antes de Aproba» y «Marcar como cobrado»", fichaExp.includes("Facturado antes de Aproba") && fichaExp.includes("Marcar como cobrado"));
  const fichaCli = await pagina(`/app/clientes/${cid.ZZC0001}`);
  check("la ficha de Karim marca su servicio «Pendiente de cobro»", fichaCli.includes("Pendiente de cobro"));

  console.log("\nC. Marcar cobrado / volver a pendiente");
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "servicio", id: h.ZZC0001.id, cobro: "COBRADA" }) });
  const { data: hk } = await admin.from("ServicioHistorico").select("cobro").eq("id", h.ZZC0001.id).maybeSingle();
  check("servicio de Karim → COBRADA", r.status === 200 && hk?.cobro === "COBRADA", JSON.stringify(r));
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "expediente", id: exp.id, cobro: "COBRADA" }) });
  const { data: e2 } = await admin.from("Expediente").select("cobroPrevio").eq("id", exp.id).maybeSingle();
  check("expediente de Amadou → COBRADA", r.status === 200 && e2?.cobroPrevio === "COBRADA", JSON.stringify(r));
  const { data: ev2 } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", exp.id).like("descripcion", "%marcado como cobrado%");
  check("…con su línea en el historial", (ev2 ?? []).length === 1);
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "expediente", id: exp.id, cobro: "PENDIENTE" }) });
  const { data: e3 } = await admin.from("Expediente").select("cobroPrevio").eq("id", exp.id).maybeSingle();
  check("«Volver a pendiente» → PENDIENTE", r.status === 200 && e3?.cobroPrevio === "PENDIENTE", JSON.stringify(r));
  const fact2 = await pagina("/app/facturas");
  check("Karim ya no está en Cobros pendientes; Amadou sí", !fact2.includes("ZZCOB Karim Solo") && fact2.includes("ZZCOB Amadou Curso"));

  console.log("\nD. Seguridad");
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "servicio", id: h.ZZC0002.id, cobro: "PENDIENTE" }) }, false);
  check("sin sesión → 401", r.status === 401, String(r.status));
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "servicio", id: "no-existe", cobro: "COBRADA" }) });
  check("un id inexistente → 404", r.status === 404, String(r.status));
  // Un servicio de OTRO despacho, sin cobro: la ruta no debe verlo (404). Aunque fallara la
  // RLS, un servicio sin cobro anterior devuelve 409 sin escribir nada.
  const { data: ajeno } = await admin.from("ServicioHistorico").select("id").neq("workspaceId", WS_DEMO).is("cobro", null).limit(1).maybeSingle();
  if (ajeno) {
    r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "servicio", id: ajeno.id, cobro: "COBRADA" }) });
    const { data: sigue } = await admin.from("ServicioHistorico").select("cobro").eq("id", ajeno.id).maybeSingle();
    check("un servicio de otro despacho → 404 y sin tocar", r.status === 404 && sigue?.cobro === null, `${r.status} ${JSON.stringify(sigue)}`);
  }
  r = await api("/api/cobros-previos", { method: "POST", body: JSON.stringify({ tipo: "servicio", id: h.ZZC0004.id, cobro: "COBRADA" }) });
  check("un servicio sin cobro anterior → 409", r.status === 409, String(r.status));

  console.log("\nE. Reimportar: rellena y sube, nunca baja ni duplica");
  const filas2 = [
    ["ZZCOB Karim Solo", "ZZC0001", "Arraigo", "Resuelto", "390", "Pendiente"],   // ya COBRADA en Aproba → se queda cobrada
    ["ZZCOB Lina Duda", "ZZC0004", "Arraigo", "Resuelto", "100", "Cobrada"],      // vacío → se rellena
    ["ZZCOB Amadou Curso", "ZZC0003", "Arraigo", "Presentado", "150", "Cobrada"], // PENDIENTE → sube a cobrada
  ];
  r = await api("/api/importar/ejecutar", { method: "POST", body: JSON.stringify({ filas: filas2, mapeo, primeraFilaEsCabecera: false }) });
  check("0 clientes, 0 servicios y 0 expedientes nuevos", r.status === 200 && r.j.clientesCreados === 0 && r.j.serviciosCreados === 0 && r.j.expedientesCreados === 0, JSON.stringify(r.j).slice(0, 220));
  const { data: hs2 } = await admin.from("ServicioHistorico").select("id, cobro").in("id", [h.ZZC0001.id, h.ZZC0004.id]);
  const c2 = Object.fromEntries((hs2 ?? []).map((x) => [x.id, x.cobro]));
  check("Karim sigue COBRADA (lo marcado en Aproba manda)", c2[h.ZZC0001.id] === "COBRADA", JSON.stringify(c2));
  check("Lina pasa a COBRADA (hueco rellenado)", c2[h.ZZC0004.id] === "COBRADA", JSON.stringify(c2));
  const { data: e4 } = await admin.from("Expediente").select("cobroPrevio").eq("id", exp.id).maybeSingle();
  check("Amadou sube a COBRADA", e4?.cobroPrevio === "COBRADA", JSON.stringify(e4));
  const { count: nHist } = await admin.from("ServicioHistorico").select("id", { count: "exact", head: true }).in("clienteId", Object.values(cid));
  check("sigue habiendo 3 servicios en el historial", nHist === 3, String(nHist));
} finally {
  const { data: cls } = await admin.from("Cliente").select("id").eq("workspaceId", WS_DEMO).like("nombre", "ZZCOB%");
  const ids = (cls ?? []).map((c) => c.id);
  if (ids.length) {
    await admin.from("ServicioHistorico").delete().in("clienteId", ids);
    await admin.from("Vencimiento").delete().in("clienteId", ids);
    await admin.from("Expediente").delete().in("clienteId", ids);
    await admin.from("Cliente").delete().in("id", ids);
  }
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZCOB%");
  console.log(`\nlimpieza: ${ids.length} clientes (+ historial, vencimientos y expedientes) · restos ZZCOB: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
}
