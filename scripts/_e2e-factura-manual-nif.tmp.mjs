// E2E — NIF/CIF y domicilio en la factura MANUAL («+ Nueva factura», 24/09/2026 — la
// 2026-0006 de Luis salió sin NIF). SOLO sobre la DEMO (Gestoría Vallès). Crea y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-factura-manual-nif.tmp.mjs <cookies.json>
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
const pagina = async (path) => (await fetch(`${BASE}${path}`, { headers: { Cookie: cookies } })).text();
const leer = async (id) => (await admin.from("Factura").select("clienteDatos, clienteId, empresaId, clienteNombre").eq("id", id).maybeSingle()).data;
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const creadas = []; let empresaTmp = null;
const nueva = async (extra) => {
  const r = await api("/api/facturas", { method: "POST", body: JSON.stringify({ cliente: "ZZNIF Cliente", concepto: "ZZNIF Asesoramiento", baseImponible: 100, ...extra }) });
  if (r.j?.id) creadas.push(r.j.id);
  return r;
};

try {
  const { data: cli } = await admin.from("Cliente").select("id, nombre, apellidos, numeroDocumento, via, municipio").eq("workspaceId", WS_DEMO).not("numeroDocumento", "is", null).neq("numeroDocumento", "").limit(1).maybeSingle();
  const { data: emp } = await admin.from("Empresa").insert({ id: crypto.randomUUID(), workspaceId: WS_DEMO, razonSocial: "ZZNIF Talleres Ebro S.L.", nif: "B82422015", domicilio: "Calle Mayor 12", codigoPostal: "28001", municipio: "Madrid", updatedAt: new Date().toISOString() }).select("id").single();
  empresaTmp = emp?.id;

  console.log("\nA. NIF y domicilio escritos a mano");
  let r = await nueva({ documento: " b-8242.2015 ", direccion: "Calle Mayor 12,\n 28001 Madrid" });
  let f = await leer(r.j.id);
  check("200 y la factura guarda «CIF/NIF B82422015» y el domicilio en una línea", r.status === 200 && f?.clienteDatos?.documento === "CIF/NIF B82422015" && f?.clienteDatos?.direccion === "Calle Mayor 12, 28001 Madrid", JSON.stringify({ r: r.status, f }));
  check("la respuesta devuelve los datos congelados", r.j.clienteDatos?.documento === "CIF/NIF B82422015", JSON.stringify(r.j.clienteDatos));
  const idA = r.j.id;
  const html = await pagina(`/app/facturas/${idA}`);
  check("la factura (vista/PDF) imprime el CIF y el domicilio", html.includes("CIF/NIF B82422015") && html.includes("Calle Mayor 12, 28001 Madrid"));
  const lista = await pagina("/app/facturas");
  check("la lista lleva el CIF (el CSV de emitidas lo exporta)", lista.includes("CIF/NIF B82422015"));
  r = await nueva({ documento: "AB 123456" });
  check("un documento que no es español → «Pasaporte AB123456»", (await leer(r.j.id))?.clienteDatos?.documento === "Pasaporte AB123456");

  console.log("\nB. Elegido de la lista: los datos salen de la ficha");
  if (cli) {
    r = await nueva({ cliente: [cli.nombre, cli.apellidos].filter(Boolean).join(" "), clienteId: cli.id, documento: "", direccion: "" });
    f = await leer(r.j.id);
    check("cliente con NIE: queda ligado y congela su NIE de la ficha", f?.clienteId === cli.id && f?.clienteDatos?.documento === `NIE/DNI ${String(cli.numeroDocumento).replace(/[\s.-]/g, "").toUpperCase()}`, JSON.stringify(f));
    const fichaCli = await pagina(`/app/clientes/${cli.id}`);
    check("…y la factura aparece en la ficha del cliente", fichaCli.includes(r.j.numero));
    r = await nueva({ clienteId: cli.id, documento: "Y7654321Z", direccion: "" });
    check("si el gestor escribe otro documento, manda lo escrito", (await leer(r.j.id))?.clienteDatos?.documento === "NIE/DNI Y7654321Z");
  }
  r = await nueva({ cliente: "ZZNIF Talleres Ebro S.L.", empresaId: empresaTmp, documento: "", direccion: "" });
  f = await leer(r.j.id);
  check("empresa: queda ligada con su CIF y su domicilio fiscal", f?.empresaId === empresaTmp && f?.clienteDatos?.documento === "CIF/NIF B82422015" && /Calle Mayor 12 · 28001 Madrid/.test(f?.clienteDatos?.direccion ?? ""), JSON.stringify(f));

  console.log("\nC. Seguridad: un cliente de OTRO despacho no se enlaza ni presta sus datos");
  const { data: ajeno } = await admin.from("Cliente").select("id").neq("workspaceId", WS_DEMO).not("numeroDocumento", "is", null).limit(1).maybeSingle();
  if (ajeno) {
    r = await nueva({ clienteId: ajeno.id, documento: "", direccion: "" });
    f = await leer(r.j.id);
    check("clienteId ajeno → sin enlace y sin datos fiscales", r.status === 200 && f?.clienteId === null && f?.clienteDatos === null, JSON.stringify(f));
  }

  console.log("\nD. Editar una factura manual");
  let g = await api(`/api/facturas/${idA}`);
  check("GET devuelve los datos fiscales para rellenar el formulario", g.status === 200 && g.j.clienteDatos?.documento === "CIF/NIF B82422015", JSON.stringify(g.j).slice(0, 200));
  r = await api(`/api/facturas/${idA}`, { method: "PUT", body: JSON.stringify({ clienteNombre: "ZZNIF Cliente", concepto: "ZZNIF Asesoramiento", baseImponible: 100, documento: "x1234567l", direccion: "Av. de Bilbao 8, 39300 Torrelavega" }) });
  f = await leer(idA);
  check("PUT cambia el documento y el domicilio", r.status === 200 && f?.clienteDatos?.documento === "NIE/DNI X1234567L" && f?.clienteDatos?.direccion === "Av. de Bilbao 8, 39300 Torrelavega", JSON.stringify({ r: r.j, f }));
  r = await api(`/api/facturas/${idA}`, { method: "PUT", body: JSON.stringify({ clienteNombre: "ZZNIF Cliente", concepto: "ZZNIF Asesoramiento", baseImponible: 120 }) });
  f = await leer(idA);
  check("un PUT sin esos campos (cobro de expediente) no los toca", r.status === 200 && f?.clienteDatos?.documento === "NIE/DNI X1234567L", JSON.stringify(f));
  r = await api(`/api/facturas/${idA}`, { method: "PUT", body: JSON.stringify({ clienteNombre: "ZZNIF Cliente", concepto: "ZZNIF Asesoramiento", baseImponible: 120, documento: "", direccion: "" }) });
  check("vaciar los dos campos los retira", r.status === 200 && (await leer(idA))?.clienteDatos === null);

  console.log("\nE. La pantalla «Nueva factura» carga");
  const nuevaHtml = await pagina("/app/facturas/nueva");
  check("/app/facturas/nueva → 200", nuevaHtml.length > 1000);
} finally {
  if (creadas.length) {
    const { data: nums } = await admin.from("Factura").select("numero").in("id", creadas);
    await admin.from("Factura").delete().in("id", creadas);
    for (const n of nums ?? []) await admin.from("FacturaNumeroQuemado").delete().eq("workspaceId", WS_DEMO).eq("numero", n.numero);
  }
  if (empresaTmp) await admin.from("Empresa").delete().eq("id", empresaTmp);
  const { count } = await admin.from("Factura").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("concepto", "ZZNIF%");
  const { count: nE } = await admin.from("Empresa").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).like("razonSocial", "ZZNIF%");
  console.log(`\nlimpieza: ${creadas.length} facturas, empresa temporal · restos ZZNIF: ${count} facturas, ${nE} empresas`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
}
