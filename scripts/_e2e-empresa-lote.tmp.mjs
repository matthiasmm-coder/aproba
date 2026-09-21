// E2E — expediente DE EMPRESA con trabajadores (lote 1), contra el preview local o prod.
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-empresa-lote.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j };
};
let ok = 0, ko = 0; const check = (nombre, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", nombre); } else { ko++; console.log("  ✗", nombre, extra); } };
const creados = { exp: [], cli: [], emp: [] };

try {
  // 0) sede de la demo (el usuario demo está en «Todas»: la creación exige oficina)
  const { data: ofs } = await admin.from("Oficina").select("id, nombre").eq("workspaceId", WS_DEMO).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  console.log("sede:", ofs?.[0]?.nombre ?? "(ninguna)");

  // 1) Empresa NUEVA sin trabajador → expediente de empresa (clienteId nulo)
  console.log("\n1. Crear expediente de empresa sin trabajador");
  let r = await api("/api/expedientes", { method: "POST", body: JSON.stringify({ empresaNueva: { razonSocial: "ZZE2E Talleres Ebro S.L.", nif: "B99900011", contactoNombre: "Ana Ruiz", contactoEmail: "delivered@resend.dev", domicilio: "Polígono Sur 12", codigoPostal: "50014", municipio: "Zaragoza", provincia: "Zaragoza" }, ...(sede ? { oficinaId: sede } : {}) }) });
  check("201/200 con empresa=true y 0 trabajadores", r.status === 200 && r.j.empresa === true && r.j.trabajadores === 0, JSON.stringify(r.j).slice(0, 160));
  const expId = r.j.expedienteId; if (expId) creados.exp.push(expId);
  const { data: fila } = await admin.from("Expediente").select("clienteId, empresaId, oficinaId, referencia").eq("id", expId).maybeSingle();
  check("clienteId NULL y empresaId presente en la base", fila && fila.clienteId === null && Boolean(fila.empresaId), JSON.stringify(fila));
  if (fila?.empresaId) creados.emp.push(fila.empresaId);
  check("hereda la sede de la empresa", !sede || fila?.oficinaId === sede, String(fila?.oficinaId));

  // 2) Añadir trabajador NUEVO y uno EXISTENTE (creado antes en Clientes)
  console.log("\n2. Trabajadores");
  const { data: existente } = await admin.from("Cliente").insert({ id: crypto.randomUUID(), workspaceId: WS_DEMO, nombre: "ZZE2E Mamadou", apellidos: "Diallo", nacionalidad: "Senegal", updatedAt: new Date().toISOString(), ...(sede ? { oficinaId: sede } : {}) }).select("id").single();
  creados.cli.push(existente.id);
  r = await api(`/api/expedientes/${expId}/trabajadores`, { method: "POST", body: JSON.stringify({ nuevo: { nombre: "ZZE2E Fatima", apellidos: "Benali", email: "delivered@resend.dev", nacionalidad: "Marruecos" } }) });
  check("alta de trabajador nuevo", r.status === 200 && r.j.trabajador?.nombre === "ZZE2E Fatima Benali", JSON.stringify(r.j).slice(0, 160));
  const nuevoId = r.j.clienteId; if (nuevoId) creados.cli.push(nuevoId);
  r = await api(`/api/expedientes/${expId}/trabajadores`, { method: "POST", body: JSON.stringify({ clienteId: existente.id }) });
  check("alta de trabajador existente (total 2)", r.status === 200 && r.j.total === 2, JSON.stringify(r.j).slice(0, 160));
  const { data: cliEx } = await admin.from("Cliente").select("empresaId").eq("id", existente.id).maybeSingle();
  check("el existente queda atado a la empresa", cliEx?.empresaId === fila?.empresaId);
  r = await api(`/api/expedientes/${expId}/trabajadores`, { method: "POST", body: JSON.stringify({ clienteId: existente.id }) });
  check("repetir el alta → 409", r.status === 409, String(r.status));
  const { data: filasT } = await admin.from("ExpedienteTrabajador").select("clienteId, token").eq("expedienteId", expId);
  check("2 filas con token de 32 hex", filasT?.length === 2 && filasT.every((f) => /^[0-9a-f]{32}$/.test(f.token)), JSON.stringify(filasT));

  // 3) Ficha y tablero: nombre = la empresa, con «2 trabajadores»
  console.log("\n3. Pantallas");
  const html = await (await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { Cookie: cookies } })).text();
  check("la ficha titula con la empresa", html.includes("ZZE2E Talleres Ebro S.L."));
  check("la ficha dice «2 trabajadores»", /2 trabajadores/.test(html));
  check("la ficha NO muestra la sección Información del titular", !/Sin rellenar|sin rellenar/.test(html) || !/0\/20/.test(html));
  check("sección de trabajadores con los dos nombres", html.includes("ZZE2E Fatima Benali") && html.includes("ZZE2E Mamadou Diallo"));
  const tablero = await (await fetch(`${BASE}/app/expedientes`, { headers: { Cookie: cookies } })).text();
  check("el tablero muestra la empresa (no «—»)", tablero.includes("ZZE2E Talleres Ebro S.L."));

  // 4) Formularios por trabajador (GET oficial con clienteId) y tasa nominativa (404 sin generar)
  console.log("\n4. Por trabajador");
  r = await api(`/api/expedientes/${expId}/formularios?tipo=EX-10&modo=oficial&clienteId=${nuevoId}`);
  check("formulario oficial de un trabajador del lote (200 pdf o 409 sin servicio)", [200, 409, 400].includes(r.status), String(r.status) + " " + JSON.stringify(r.j).slice(0, 100));
  r = await api(`/api/expedientes/${expId}/formularios?tipo=EX-10&modo=oficial&clienteId=${crypto.randomUUID()}`);
  check("un clienteId ajeno NO pasa (404/400)", [404, 400, 409].includes(r.status), String(r.status));
  const mandato = await fetch(`${BASE}/api/expedientes/${expId}/encargo?doc=mandato&clienteId=${nuevoId}`, { headers: { Cookie: cookies } });
  check("mandato del trabajador (PDF o 409 sin servicio)", [200, 409].includes(mandato.status), String(mandato.status));

  // 5) Presentado por trabajador
  console.log("\n5. Presentado por trabajador");
  r = await api(`/api/expedientes/${expId}/trabajadores/${nuevoId}`, { method: "PATCH", body: JSON.stringify({ presentado: true }) });
  check("marcar presentado", r.status === 200 && Boolean(r.j.presentadoAt), JSON.stringify(r.j));
  r = await api(`/api/expedientes/${expId}/trabajadores/${nuevoId}`, { method: "PATCH", body: JSON.stringify({ presentado: false }) });
  check("desmarcar presentado", r.status === 200 && r.j.presentadoAt === null, JSON.stringify(r.j));

  // 6) Quitar: con documento a su nombre → 409; sin él → 200
  console.log("\n6. Quitar del expediente");
  const { data: doc } = await admin.from("Documento").insert({ id: crypto.randomUUID(), expedienteId: expId, clienteId: nuevoId, tipo: "PASAPORTE", estado: "PENDIENTE" }).select("id").single();
  r = await api(`/api/expedientes/${expId}/trabajadores/${nuevoId}`, { method: "DELETE" });
  check("con documento → 409 y explica", r.status === 409 && /documentos/.test(r.j.error ?? ""), String(r.status) + " " + (r.j.error ?? ""));
  await admin.from("Documento").delete().eq("id", doc.id);
  r = await api(`/api/expedientes/${expId}/trabajadores/${nuevoId}`, { method: "DELETE" });
  check("sin rastro → 200 y la persona sigue en Clientes", r.status === 200 && Boolean((await admin.from("Cliente").select("id").eq("id", nuevoId).maybeSingle()).data));
  const { count: nT } = await admin.from("ExpedienteTrabajador").select("id", { count: "exact", head: true }).eq("expedienteId", expId);
  check("queda 1 trabajador en el lote", nT === 1, String(nT));

  // 7) Empresa EXISTENTE con varios trabajadores al crear
  console.log("\n7. Empresa existente con trabajadores al crear");
  r = await api("/api/expedientes", { method: "POST", body: JSON.stringify({ empresaExistenteId: fila.empresaId, trabajadorIds: [existente.id, nuevoId], nuevo: { nombre: "ZZE2E Youssef" }, ...(sede ? { oficinaId: sede } : {}) }) });
  check("crea con 3 trabajadores", r.status === 200 && r.j.trabajadores === 3, JSON.stringify(r.j).slice(0, 160));
  if (r.j.expedienteId) creados.exp.push(r.j.expedienteId);
  const { data: t3 } = await admin.from("ExpedienteTrabajador").select("clienteId").eq("expedienteId", r.j.expedienteId);
  for (const t of t3 ?? []) if (![existente.id, nuevoId].includes(t.clienteId)) creados.cli.push(t.clienteId);
  check("3 filas en la base", t3?.length === 3, String(t3?.length));

  // 8) /j del expediente de empresa → portal de la EMPRESA (lote 2): saluda al contacto y
  //    pide los datos de la empresa y de sus trabajadores (nunca «Julia», nunca ficha de persona).
  console.log("\n8. Portal");
  const { data: tok } = await admin.from("Expediente").select("portalToken").eq("id", expId).maybeSingle();
  const j = await (await fetch(`${BASE}/j/${tok.portalToken}`)).text();
  const texto = j.replace(/<!-- -->/g, "");
  check("/j abre el portal de la empresa (saluda a Ana Ruiz, pide los datos de la empresa y de sus trabajadores)", /Hola Ana Ruiz/.test(texto) && texto.includes("Datos de la empresa y de sus trabajadores") && !texto.includes("Julia"), texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  // Limpieza total (demo intacta)
  for (const id of creados.exp) await admin.from("Expediente").delete().eq("id", id);
  for (const id of creados.cli) await admin.from("Cliente").delete().eq("id", id);
  for (const id of creados.emp) await admin.from("Empresa").delete().eq("id", id);
  const { count: resto } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  console.log(`\nlimpieza: ${creados.exp.length} expedientes, ${creados.cli.length} clientes, ${creados.emp.length} empresas borrados · restos ZZE2E: ${resto}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
