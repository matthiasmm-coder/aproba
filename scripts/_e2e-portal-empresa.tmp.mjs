// E2E — PORTAL de un expediente DE EMPRESA (lote 2), contra el preview local o prod.
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, recorre el portal por
// sus rutas de token, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-portal-empresa.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const gestor = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j };
};
const portal = async (path, method, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j };
};
let ok = 0, ko = 0; const check = (nombre, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", nombre); } else { ko++; console.log("  ✗", nombre, extra); } };
const creados = { exp: [], cli: [], emp: [] };
const ficha = (nombre, apellidos) => ({ nombre, apellidos, sexo: "H", fechaNacimiento: "1990-05-14", lugarNacimiento: "Dakar", paisNacimiento: "Senegal", nacionalidad: "Senegal", pasaporte: "A1234567", estadoCivil: "SOLTERO", nombrePadre: "Ibrahima", nombreMadre: "Awa", via: "Calle Mayor", numeroVia: "12", codigoPostal: "08001", municipio: "Barcelona", provincia: "Barcelona", telefono: "+34 611 000 111", email: "delivered@resend.dev" });
// PNG 1×1 para las subidas (el mandato firmado no pasa por la IA: va directo a VALIDADO).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

try {
  const { data: ofs } = await admin.from("Oficina").select("id, nombre").eq("workspaceId", WS_DEMO).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  const { data: svs } = await admin.from("ServicioConfig").select("clave, label, docs, anticipo").eq("workspaceId", WS_DEMO).limit(60);
  const sv = (svs ?? []).find((x) => /arraigo/i.test(x.label ?? "") && Array.isArray(x.docs) && x.docs.length) ?? (svs ?? []).find((x) => Array.isArray(x.docs) && x.docs.length);
  console.log("sede:", ofs?.[0]?.nombre ?? "(ninguna)", "| servicio:", sv?.label ?? "(ninguno)");

  // 1) Expediente de empresa sin trabajadores → su enlace
  console.log("\n1. Expediente de empresa y su enlace");
  let r = await gestor("/api/expedientes", { method: "POST", body: JSON.stringify({ empresaNueva: { razonSocial: "ZZE2E Portal Norte S.L.", nif: "B99900022", contactoNombre: "Ana Ruiz", contactoEmail: "delivered@resend.dev" }, ...(sede ? { oficinaId: sede } : {}) }) });
  check("expediente creado", r.status === 200 && r.j.empresa === true, JSON.stringify(r.j).slice(0, 120));
  const expId = r.j.expedienteId, token = r.j.portalToken; if (expId) creados.exp.push(expId);
  const { data: fila } = await admin.from("Expediente").select("empresaId").eq("id", expId).maybeSingle();
  if (fila?.empresaId) creados.emp.push(fila.empresaId);
  const html0 = await (await fetch(`${BASE}/j/${token}`)).text();
  check("/j abre el portal de empresa (paso «Empresa y trabajadores»)", html0.includes("Datos de la empresa y de sus trabajadores") && html0.includes("ZZE2E Portal Norte"));
  check("/j no saluda a «Julia» ni muestra la espera", !html0.includes("Julia") && !html0.includes("estará disponible muy pronto"));

  // 2) La empresa completa sus datos
  console.log("\n2. Datos de la empresa");
  r = await portal("/api/portal/empresa", "PUT", { token, empresa: { razonSocial: "ZZE2E Portal Norte S.L.", nif: "b-9990.0022", domicilio: "Polígono Norte 4", codigoPostal: "08040", municipio: "Barcelona", provincia: "Barcelona", contactoNombre: "Ana Ruiz", contactoEmail: "delivered@resend.dev", contactoTelefono: "+34 933 000 111" } });
  check("PUT empresa 200", r.status === 200, JSON.stringify(r.j));
  const { data: em } = await admin.from("Empresa").select("nif, domicilio, municipio").eq("id", fila.empresaId).maybeSingle();
  check("CIF normalizado y domicilio guardado", em?.nif === "B99900022" && em?.domicilio === "Polígono Norte 4", JSON.stringify(em));
  r = await portal("/api/portal/empresa", "PUT", { token: "0".repeat(32), empresa: { razonSocial: "X" } });
  check("token ajeno → 404", r.status === 404, String(r.status));

  // 3) Trabajadores desde el portal
  console.log("\n3. Trabajadores");
  r = await portal("/api/portal/trabajadores", "POST", { token, ficha: ficha("ZZE2E Moussa", "Ndiaye"), idioma: "fr" });
  check("alta con ficha completa", r.status === 200 && Boolean(r.j.id), JSON.stringify(r.j));
  const t1 = r.j.id; if (t1) creados.cli.push(t1);
  r = await portal("/api/portal/trabajadores", "POST", { token, ficha: ficha("ZZE2E Aissatou", "Sow") });
  const t2 = r.j.id; if (t2) creados.cli.push(t2);
  check("segunda alta", r.status === 200 && Boolean(t2));
  const { data: c1 } = await admin.from("Cliente").select("empresaId, idioma, municipio, oficinaId").eq("id", t1).maybeSingle();
  check("el trabajador nace atado a la empresa, con idioma y sede", c1?.empresaId === fila.empresaId && c1?.idioma === "fr" && c1?.municipio === "Barcelona" && (!sede || c1?.oficinaId === sede), JSON.stringify(c1));
  r = await portal("/api/portal/trabajadores", "PUT", { token, clienteId: t1, ficha: { municipio: "Girona", nombre: "" } });
  const { data: c1b } = await admin.from("Cliente").select("nombre, municipio").eq("id", t1).maybeSingle();
  check("PUT corrige la ficha sin vaciar el nombre", r.status === 200 && c1b?.municipio === "Girona" && c1b?.nombre === "ZZE2E Moussa", JSON.stringify(c1b));
  r = await portal("/api/portal/trabajadores", "PUT", { token, clienteId: crypto.randomUUID(), ficha: { municipio: "X" } });
  check("PUT de un id ajeno → 404", r.status === 404, String(r.status));
  r = await portal("/api/portal/trabajadores", "POST", { token, ficha: { apellidos: "Sin nombre" } });
  check("sin nombre → 400", r.status === 400, String(r.status));
  const { count: nT } = await admin.from("ExpedienteTrabajador").select("id", { count: "exact", head: true }).eq("expedienteId", expId);
  check("2 filas en el lote", nT === 2, String(nT));

  // 4) Trámite fijado desde el portal
  console.log("\n4. Trámite");
  if (sv) {
    r = await portal("/api/portal/iniciar", "POST", { token, clave: sv.clave, asignacion: { [sv.clave]: [t1, t2, crypto.randomUUID()] } });
    check("iniciar con asignación por trabajador", r.status === 200, JSON.stringify(r.j).slice(0, 120));
    const { data: e2 } = await admin.from("Expediente").select("servicioClave, serviciosAsignacion").eq("id", expId).maybeSingle();
    const asig = e2?.serviciosAsignacion?.[sv.clave] ?? [];
    check("la asignación solo guarda trabajadores del lote", e2?.servicioClave === sv.clave && asig.length === 2 && asig.includes(t1) && asig.includes(t2), JSON.stringify(e2));
    r = await portal("/api/portal/iniciar", "POST", { token, clave: sv.clave });
    check("segunda vez: primero-escribe-gana (bloqueado)", r.status === 200 && r.j.bloqueado === true, JSON.stringify(r.j));
  }

  // 5) Documentos por trabajador desde el portal (mandato firmado → VALIDADO sin IA)
  console.log("\n5. Documentos por trabajador");
  const subir = async (clienteId) => {
    const fd = new FormData();
    fd.set("token", token); fd.set("label", "Mandato de representación firmado"); if (clienteId) fd.set("clienteId", clienteId);
    fd.set("file", new File([PNG], "mandato.png", { type: "image/png" }));
    const res = await fetch(`${BASE}/api/portal/documentos`, { method: "POST", body: fd });
    return { status: res.status, j: await res.json().catch(() => ({})) };
  };
  r = await subir(t1);
  check("subida a la casilla del trabajador 1", r.status === 200 && r.j.estado === "VALIDADO", JSON.stringify(r.j).slice(0, 120));
  const { data: d1 } = await admin.from("Documento").select("clienteId, tipo, estado").eq("expedienteId", expId);
  check("el documento queda a nombre del trabajador", (d1 ?? []).some((d) => d.clienteId === t1 && d.tipo === "MANDATO" && d.estado === "VALIDADO"), JSON.stringify(d1));
  r = await subir(crypto.randomUUID());
  check("clienteId ajeno → 404", r.status === 404, String(r.status));
  r = await portal("/api/portal/trabajadores", "DELETE", { token, clienteId: t1 });
  check("quitar con documento → 409", r.status === 409, String(r.status));
  r = await portal("/api/portal/trabajadores", "DELETE", { token, clienteId: t2 });
  const { data: c2 } = await admin.from("Cliente").select("id").eq("id", t2).maybeSingle();
  check("quitar sin rastro → 200 y la persona (creada aquí) desaparece", r.status === 200 && !c2, JSON.stringify(r.j));
  if (!c2) creados.cli = creados.cli.filter((x) => x !== t2);

  // 6) Mandato PDF del trabajador y /s por trabajador
  console.log("\n6. PDF y seguimiento");
  const m1 = await fetch(`${BASE}/api/portal/encargo?token=${token}&doc=mandato&clienteId=${t1}`);
  check("mandato del trabajador (200 pdf, o 404 si la hoja no está activa)", [200, 404, 409].includes(m1.status), String(m1.status));
  if (m1.status === 200) check("…y el nombre del fichero lleva al trabajador", /mandato-.*-zze2e-moussa-ndiaye\.pdf/.test(m1.headers.get("content-disposition") ?? ""), m1.headers.get("content-disposition") ?? "");
  const mX = await fetch(`${BASE}/api/portal/encargo?token=${token}&doc=mandato&clienteId=${crypto.randomUUID()}`);
  check("mandato de un id ajeno → 404", mX.status === 404 || mX.status === 409, String(mX.status));
  const sHtml = await (await fetch(`${BASE}/s/${token}`)).text();
  check("/s muestra la sección del trabajador", sHtml.includes("ZZE2E Moussa"));

  // 7) Pago: la factura automática multiplica por los trabajadores del lote
  console.log("\n7. Pago ×trabajadores");
  r = await portal("/api/portal/trabajadores", "POST", { token, ficha: ficha("ZZE2E Fatou", "Diop") });
  const t3 = r.j.id; if (t3) creados.cli.push(t3);
  r = await portal("/api/pagos", "POST", { token, momento: "ANTICIPO" });
  const anticipoUnit = Number(sv?.anticipo ?? 0);
  check("factura emitida desde el portal", r.status === 200 && Boolean(r.j.facturaId ?? r.j.numero ?? r.j.ok), JSON.stringify(r.j).slice(0, 140));
  const { data: fac } = await admin.from("Factura").select("baseImponible, clienteNombre, empresaId, clienteId").eq("expedienteId", expId).order("createdAt", { ascending: false }).limit(1).maybeSingle();
  if (anticipoUnit > 0) check(`base = anticipo × 2 trabajadores (${anticipoUnit} × 2)`, fac && Math.abs(Number(fac.baseImponible) - anticipoUnit * 2) < 0.01, JSON.stringify(fac));
  check("la factura es de la empresa y sin titular persona", fac?.empresaId === fila.empresaId && !fac?.clienteId && /ZZE2E Portal Norte/.test(fac?.clienteNombre ?? ""), JSON.stringify(fac));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  for (const id of creados.exp) { await admin.from("Factura").delete().eq("expedienteId", id); await admin.from("Expediente").delete().eq("id", id); }
  for (const id of creados.cli) await admin.from("Cliente").delete().eq("id", id);
  for (const id of creados.emp) await admin.from("Empresa").delete().eq("id", id);
  const { count: resto } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  console.log(`\nlimpieza: ${creados.exp.length} expedientes, ${creados.cli.length} clientes, ${creados.emp.length} empresas borrados · restos ZZE2E: ${resto}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
