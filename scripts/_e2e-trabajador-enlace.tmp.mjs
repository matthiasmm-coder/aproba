// E2E — ENLACE INDIVIDUAL del trabajador (lote 3), contra el preview local o prod.
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-trabajador-enlace.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const gestor = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 160) }; }
  return { status: res.status, j };
};
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const creados = { exp: [], cli: [], emp: [] };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const subir = async (token, label) => {
  const fd = new FormData();
  fd.set("token", token); fd.set("label", label); fd.set("file", new File([PNG], "doc.png", { type: "image/png" }));
  const res = await fetch(`${BASE}/api/trabajador/documentos`, { method: "POST", body: fd });
  return { status: res.status, j: await res.json().catch(() => ({})) };
};

try {
  const { data: ofs } = await admin.from("Oficina").select("id").eq("workspaceId", WS_DEMO).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  const { data: svs } = await admin.from("ServicioConfig").select("clave, label, docs").eq("workspaceId", WS_DEMO).limit(60);
  const sv = (svs ?? []).find((x) => /arraigo/i.test(x.label ?? "") && Array.isArray(x.docs) && x.docs.length) ?? (svs ?? []).find((x) => Array.isArray(x.docs) && x.docs.length);

  console.log("\n1. Expediente de empresa con un trabajador y su token");
  let r = await gestor("/api/expedientes", { method: "POST", body: JSON.stringify({ empresaNueva: { razonSocial: "ZZE2E Enlaces S.L.", contactoEmail: "delivered@resend.dev" }, nuevo: { nombre: "ZZE2E Ousmane", apellidos: "Diop", telefono: "+34 611 000 222" }, ...(sede ? { oficinaId: sede } : {}) }) });
  check("expediente + trabajador creados", r.status === 200 && r.j.trabajadores === 1, JSON.stringify(r.j).slice(0, 120));
  const expId = r.j.expedienteId, tokenEmpresa = r.j.portalToken; if (expId) creados.exp.push(expId);
  const { data: fila } = await admin.from("Expediente").select("empresaId").eq("id", expId).maybeSingle();
  if (fila?.empresaId) creados.emp.push(fila.empresaId);
  if (sv) await gestor(`/api/expedientes/${expId}/servicio`, { method: "POST", body: JSON.stringify({ clave: sv.clave }) });
  const { data: trs } = await admin.from("ExpedienteTrabajador").select("clienteId, token, enlaceEnviadoAt").eq("expedienteId", expId);
  const tr = trs?.[0]; if (tr) creados.cli.push(tr.clienteId);
  check("la fila del trabajador tiene su token (32 hex) y sin enlace enviado", Boolean(tr) && /^[0-9a-f]{32}$/.test(tr.token) && !tr.enlaceEnviadoAt, JSON.stringify(trs));

  console.log("\n2. La página /t/<token>");
  const html = await (await fetch(`${BASE}/t/${tr.token}`)).text();
  check("saluda al trabajador y muestra «Tus documentos»", html.includes("ZZE2E Ousmane") && html.includes("Tus documentos"));
  check("no enseña la empresa como cliente ni el pago", !html.includes("Datos de la empresa") && !html.includes("Pago"));
  if (sv) check("lista sus documentos del servicio", (sv.docs ?? []).some((d) => html.includes(d)), (sv.docs ?? []).join(" · "));
  const malo = await (await fetch(`${BASE}/t/${"0".repeat(32)}`)).text();
  check("token desconocido → «no es válido» (y nunca «Julia»)", malo.includes("no es válido") && !malo.includes("Julia"));
  const conTokenEmpresa = await (await fetch(`${BASE}/t/${tokenEmpresa}`)).text();
  check("el token de la EMPRESA no abre el enlace del trabajador", conTokenEmpresa.includes("no es válido"));

  console.log("\n3. Subida desde su enlace");
  r = await subir(tr.token, "Mandato de representación firmado");
  check("su mandato firmado sube y queda VALIDADO", r.status === 200 && r.j.estado === "VALIDADO", JSON.stringify(r.j).slice(0, 120));
  const { data: docs } = await admin.from("Documento").select("clienteId, tipo, estado").eq("expedienteId", expId);
  check("el documento queda a SU nombre en el expediente de la empresa", (docs ?? []).some((d) => d.clienteId === tr.clienteId && d.tipo === "MANDATO"), JSON.stringify(docs));
  r = await subir(tokenEmpresa, "Mandato de representación firmado");
  check("con el token de la empresa esta ruta no funciona (404)", r.status === 404, String(r.status));
  r = await subir("0".repeat(32), "Pasaporte");
  check("token inventado → 404", r.status === 404, String(r.status));

  console.log("\n4. Su mandato en PDF");
  const pdf = await fetch(`${BASE}/api/trabajador/encargo?token=${tr.token}`);
  check("mandato del trabajador (200 pdf, o 404 si la hoja no está activa)", [200, 404, 409].includes(pdf.status), String(pdf.status));
  if (pdf.status === 200) check("…nombrado con el trabajador", /zze2e-ousmane-diop/.test(pdf.headers.get("content-disposition") ?? ""), pdf.headers.get("content-disposition") ?? "");

  console.log("\n5. La ficha del gestor: enlace y constancia de envío");
  const ficha = await (await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { Cookie: cookies } })).text();
  check("la ficha avisa de que falta enviar el enlace", /aún no tiene su enlace/.test(ficha));
  r = await gestor(`/api/expedientes/${expId}/trabajadores/${tr.clienteId}`, { method: "PATCH", body: JSON.stringify({ enlaceEnviado: true }) });
  check("marcar el enlace como enviado", r.status === 200, JSON.stringify(r.j));
  const { data: tr2 } = await admin.from("ExpedienteTrabajador").select("enlaceEnviadoAt").eq("expedienteId", expId).maybeSingle();
  check("enlaceEnviadoAt queda sellado", Boolean(tr2?.enlaceEnviadoAt));
  const ficha2 = await (await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { Cookie: cookies } })).text();
  check("…y el aviso desaparece", !/aún no tiene su enlace/.test(ficha2));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  for (const id of creados.exp) await admin.from("Expediente").delete().eq("id", id);
  for (const id of creados.cli) await admin.from("Cliente").delete().eq("id", id);
  for (const id of creados.emp) await admin.from("Empresa").delete().eq("id", id);
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("nombre", "ZZE2E%");
  console.log(`\nlimpieza: ${creados.exp.length} expedientes, ${creados.cli.length} clientes, ${creados.emp.length} empresas · restos ZZE2E: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
