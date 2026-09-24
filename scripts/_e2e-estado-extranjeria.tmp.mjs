// E2E — Estado en Extranjería, sección unificada de la ficha (24/09/2026). SOLO sobre la DEMO.
// Crea un expediente presentado temporal, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-estado-extranjeria.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}, conSesion = true) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(conSesion ? { Cookie: cookies } : {}), ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j };
};
const pagina = async (path) => (await fetch(`${BASE}${path}`, { headers: { Cookie: cookies } })).text();
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const now = () => new Date().toISOString();
const hoy = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
const cliId = crypto.randomUUID(), expId = crypto.randomUUID();
const ref = `ZZEXT-${Date.now()}`;

try {
  const { data: ofs } = await admin.from("Oficina").select("id").eq("workspaceId", WS).order("nombre");
  const sede = ofs?.[0]?.id ?? null;
  await admin.from("Cliente").insert({ id: cliId, workspaceId: WS, nombre: "ZZEXT", apellidos: "Prueba", numeroDocumento: "Z9990002B", fechaNacimiento: "1990-05-10", updatedAt: now(), ...(sede ? { oficinaId: sede } : {}) });
  await admin.from("Expediente").insert({ id: expId, workspaceId: WS, clienteId: cliId, referencia: ref, portalToken: crypto.randomUUID().replace(/-/g, ""), tipo: "OTRO", servicioClave: "arraigo_social", estado: "PRESENTADO", fechaPresentacion: now(), numeroOficial: "08/909090/2026", updatedAt: now(), ...(sede ? { oficinaId: sede } : {}) });

  console.log("\n1. La ficha: una sola sección «Estado en Extranjería»");
  let ficha = await pagina(`/app/expedientes/${expId}`);
  check("la sección sale con «¿Qué dice Extranjería?» y sus cuatro respuestas", ficha.includes("Estado en Extranjería") && ficha.includes("¿Qué dice Extranjería?") && ["En trámite", "Requerimiento", "Resolución favorable", "Resolución desfavorable"].every((x) => ficha.includes(x)));
  check("lleva el ancla #requerimientos (enlaces de la vista Requerimientos)", ficha.includes('id="requerimientos"'));
  check("«Consultar» vive en la sección (no en la cabecera)", ficha.includes("Consultar") && ficha.includes("Sin respuesta registrada"));

  console.log("\n2. «En trámite»");
  let r = await api(`/api/expedientes/${expId}/estado-extranjeria`, { method: "PATCH", body: JSON.stringify({ estado: "EN_TRAMITE" }) });
  const { data: e1 } = await admin.from("Expediente").select("estadoExtranjeria, estadoExtranjeriaAt").eq("id", expId).single();
  check("PATCH → 200 y queda EN_TRAMITE con la fecha", r.status === 200 && e1.estadoExtranjeria === "EN_TRAMITE" && Math.abs(Date.parse(e1.estadoExtranjeriaAt) - Date.now()) < 120000, JSON.stringify({ r: r.j, e1 }));
  const { data: ev } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", expId);
  check("deja rastro en el historial con la fecha de la consulta", (ev ?? []).some((x) => x.descripcion === `🔎 Extranjería: en trámite (consultado el ${hoy})`), JSON.stringify(ev));
  ficha = await pagina(`/app/expedientes/${expId}`);
  check("la ficha dice «En trámite · consultado el …»", ficha.includes("consultado el") && ficha.includes(hoy));
  const lista = await pagina("/app/expedientes");
  check("la fila de la lista dice «En trámite dd/mm»", new RegExp(`${ref}[\\s\\S]{0,1500}En trámite(<!-- -->)?\\s*(<!-- -->)?${hoy.slice(0, 5).replace("/", "\\/")}`).test(lista));

  console.log("\n3. Validación y seguridad");
  r = await api(`/api/expedientes/${expId}/estado-extranjeria`, { method: "PATCH", body: JSON.stringify({ estado: "RESUELTO" }) });
  check("estado desconocido → 400", r.status === 400, String(r.status));
  r = await api(`/api/expedientes/${expId}/estado-extranjeria`, { method: "PATCH", body: JSON.stringify({ estado: "EN_TRAMITE" }) }, false);
  check("sin sesión → 401", r.status === 401, String(r.status));
  const { data: ajeno } = await admin.from("Expediente").select("id").neq("workspaceId", WS).limit(1).maybeSingle();
  if (ajeno) {
    r = await api(`/api/expedientes/${ajeno.id}/estado-extranjeria`, { method: "PATCH", body: JSON.stringify({ estado: "EN_TRAMITE" }) });
    const { data: intacto } = await admin.from("Expediente").select("estadoExtranjeria").eq("id", ajeno.id).single();
    check("expediente de otro despacho → 404 y sin tocarlo", r.status === 404 && intacto.estadoExtranjeria === null, `${r.status} ${JSON.stringify(intacto)}`);
  }

  console.log("\n4. Un requerimiento pendiente manda sobre «en trámite»");
  const limite = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  r = await api(`/api/expedientes/${expId}/requerimientos`, { method: "POST", body: JSON.stringify({ asunto: "ZZEXT antecedentes penales", fechaLimite: limite, avisarDias: 3 }) });
  check("requerimiento creado", r.status === 200 || r.status === 201, JSON.stringify(r.j).slice(0, 160));
  ficha = await pagina(`/app/expedientes/${expId}`);
  const [a, m, d] = limite.split("-");
  check("la ficha dice «Requerimiento pendiente · plazo …» y lista el requerimiento", ficha.includes("Requerimiento pendiente") && ficha.includes(`${d}/${m}/${a}`) && ficha.includes("ZZEXT antecedentes penales"));

  console.log("\n5. Retirar el estado");
  r = await api(`/api/expedientes/${expId}/estado-extranjeria`, { method: "PATCH", body: JSON.stringify({ estado: null }) });
  const { data: e2 } = await admin.from("Expediente").select("estadoExtranjeria, estadoExtranjeriaAt").eq("id", expId).single();
  check("null lo borra (estado y fecha)", r.status === 200 && e2.estadoExtranjeria === null && e2.estadoExtranjeriaAt === null, JSON.stringify(e2));
} finally {
  await admin.from("Requerimiento").delete().eq("expedienteId", expId);
  await admin.from("ExpedienteEvento").delete().eq("expedienteId", expId);
  await admin.from("Expediente").delete().eq("id", expId);
  await admin.from("Cliente").delete().eq("id", cliId);
  const { count } = await admin.from("Expediente").select("id", { count: "exact", head: true }).eq("workspaceId", WS).like("referencia", "ZZEXT-%");
  console.log(`\nlimpieza: expediente, cliente, requerimientos y eventos · restos ZZEXT: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
}
