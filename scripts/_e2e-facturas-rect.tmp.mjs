// E2E — deshacer el cobro + factura rectificativa (Luis, 21/09/2026).
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-facturas-rect.tmp.mjs <cookies.json>
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
const creadas = [];

try {
  // 1) Factura manual de prueba, cobrada por error
  console.log("\n1. Deshacer el cobro");
  let r = await api("/api/facturas", { method: "POST", body: JSON.stringify({ cliente: "ZZE2E Rectificativas SL", concepto: "Certificado digital (prueba e2e)", baseImponible: 70 }) });
  check("factura creada", r.status === 200 && Boolean(r.j.id), JSON.stringify(r.j).slice(0, 140));
  const facId = r.j.id, facNum = r.j.numero; if (facId) creadas.push(facId);
  r = await api(`/api/facturas/${facId}/pagada`, { method: "POST", body: JSON.stringify({ metodo: "TRANSFERENCIA" }) });
  check("marcada como cobrada", r.status === 200 && r.j.estado === "PAGADA", JSON.stringify(r.j));
  r = await api(`/api/facturas/${facId}`, { method: "DELETE" });
  check("una pagada NO se puede eliminar (409)", r.status === 409 && /rectificativa/i.test(r.j.error ?? ""), `${r.status} ${r.j.error ?? ""}`);
  r = await api(`/api/facturas/${facId}/pagada`, { method: "DELETE" });
  check("deshacer el cobro → 200 y vuelve a EMITIDA", r.status === 200 && r.j.estado === "EMITIDA", JSON.stringify(r.j));
  let { data: f1 } = await admin.from("Factura").select("estado, metodoPago, numero").eq("id", facId).maybeSingle();
  check("en la base: EMITIDA, sin método de cobro, mismo número", f1.estado === "EMITIDA" && !f1.metodoPago && f1.numero === facNum, JSON.stringify(f1));
  r = await api(`/api/facturas/${facId}/pagada`, { method: "DELETE" });
  check("deshacer una que ya no está pagada → 409", r.status === 409, String(r.status));

  // 2) Con entregas a cuenta no se deshace (ha entrado dinero de verdad)
  console.log("\n2. Guarda de las entregas a cuenta");
  r = await api(`/api/facturas/${facId}/entregas`, { method: "POST", body: JSON.stringify({ importe: 20, metodo: "EFECTIVO" }) });
  const conEntregas = r.status === 200;
  if (conEntregas) {
    await api(`/api/facturas/${facId}/pagada`, { method: "POST", body: JSON.stringify({ metodo: "TRANSFERENCIA" }) });
    r = await api(`/api/facturas/${facId}/pagada`, { method: "DELETE" });
    check("con entregas → 409 y lo explica", r.status === 409 && /entregas/i.test(r.j.error ?? ""), `${r.status} ${r.j.error ?? ""}`);
    const { data: ent } = await admin.from("EntregaCuenta").select("id").eq("facturaId", facId);
    for (const e of ent ?? []) await admin.from("EntregaCuenta").delete().eq("id", e.id);
    r = await api(`/api/facturas/${facId}/pagada`, { method: "DELETE" });
    check("retiradas las entregas, ya se deshace", r.status === 200, JSON.stringify(r.j));
  } else { console.log("  · (sin migración de entregas: guarda no comprobable)"); }

  // 3) Rectificativa
  console.log("\n3. Factura rectificativa");
  await api(`/api/facturas/${facId}/pagada`, { method: "POST", body: JSON.stringify({ metodo: "TRANSFERENCIA" }) });
  r = await api(`/api/facturas/${facId}/rectificar`, { method: "POST", body: JSON.stringify({ motivo: "importe equivocado" }) });
  check("rectificativa emitida sobre una PAGADA", r.status === 200 && Boolean(r.j.id), JSON.stringify(r.j).slice(0, 160));
  const rectId = r.j.id, rectNum = r.j.numero; if (rectId) creadas.push(rectId);
  check("su número va en la serie R", /^R-\d{4}-\d{4}$/.test(rectNum ?? "") || /^R-[A-Z]+-\d{4}-\d{4}$/.test(rectNum ?? ""), String(rectNum));
  const { data: fr } = await admin.from("Factura").select("estado, baseImponible, iva, total, concepto, rectificaId, clienteNombre, fechaVencimiento").eq("id", rectId).maybeSingle();
  check("importes en negativo, exactamente el opuesto", Number(fr.baseImponible) === -70 && Number(fr.total) === -84.7, JSON.stringify(fr).slice(0, 140));
  check("ata a la original y la nombra en el concepto", fr.rectificaId === facId && /Rectificativa de la factura/.test(fr.concepto) && /importe equivocado/.test(fr.concepto), fr.concepto);
  check("nace EMITIDA, sin vencimiento y con el mismo cliente", fr.estado === "EMITIDA" && !fr.fechaVencimiento && fr.clienteNombre === "ZZE2E Rectificativas SL", JSON.stringify(fr).slice(0, 120));
  const { data: f2 } = await admin.from("Factura").select("estado, numero").eq("id", facId).maybeSingle();
  check("la original NO se toca (sigue PAGADA, con su número)", f2.estado === "PAGADA" && f2.numero === facNum, JSON.stringify(f2));
  check("original + rectificativa = 0", Math.abs(Number(f2 ? 84.7 : 0) + Number(fr.total)) < 0.001);

  // 4) Guardas
  console.log("\n4. Guardas");
  r = await api(`/api/facturas/${facId}/rectificar`, { method: "POST", body: JSON.stringify({}) });
  check("rectificar dos veces → 409 y dice cuál", r.status === 409 && /ya se rectificó/i.test(r.j.error ?? ""), `${r.status} ${r.j.error ?? ""}`);
  r = await api(`/api/facturas/${rectId}/rectificar`, { method: "POST", body: JSON.stringify({}) });
  check("una rectificativa no se rectifica → 409", r.status === 409, `${r.status} ${r.j.error ?? ""}`);
  r = await api(`/api/facturas/${crypto.randomUUID()}/rectificar`, { method: "POST", body: JSON.stringify({}) });
  check("una factura ajena/inexistente → 404", r.status === 404, String(r.status));

  // 5) Las pantallas
  console.log("\n5. Pantallas");
  const ficha = await (await fetch(`${BASE}/app/facturas/${rectId}`, { headers: { Cookie: cookies } })).text();
  check("el papel dice «Factura rectificativa»", ficha.includes("Factura rectificativa"));
  check("…e identifica a la rectificada", ficha.includes(facNum));
  const orig = await (await fetch(`${BASE}/app/facturas/${facId}`, { headers: { Cookie: cookies } })).text();
  check("la original enlaza a su rectificativa", orig.includes(rectNum) && /se rectific/i.test(orig));
  check("la original ofrece «Deshacer el cobro»", orig.includes("Deshacer el cobro"));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  for (const id of creadas) { await admin.from("EntregaCuenta").delete().eq("facturaId", id); }
  // La rectificativa primero (apunta a la original con FK).
  for (const id of [...creadas].reverse()) await admin.from("Factura").delete().eq("id", id);
  const { count } = await admin.from("Factura").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("clienteNombre", "ZZE2E%");
  console.log(`\nlimpieza: ${creadas.length} facturas borradas · restos ZZE2E: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
