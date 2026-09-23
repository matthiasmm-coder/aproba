// E2E — RETENCIÓN DE IRPF en facturas recibidas (Luis, 23/09/2026).
// SOLO sobre el workspace de la DEMO (Gestoría Vallès). Crea, comprueba y borra todo.
// Uso: BASE=http://localhost:3210 node scripts/_e2e-retencion.tmp.mjs <cookies.json>
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.BASE ?? "http://localhost:3210";
const WS_DEMO = "ws_lc054xg1az";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cookies = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { status: res.status, j, txt };
};
let ok = 0, ko = 0; const check = (n, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", n); } else { ko++; console.log("  ✗", n, extra); } };
const creadas = [];

// Una factura de abogado REAL: base 1.000, IVA 21 %, retención IRPF 15 %, total a pagar 1.060.
async function facturaPdf() {
  const doc = await PDFDocument.create();
  const p = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const linea = (y, txt, size = 11) => p.drawText(txt, { x: 60, y, size, font: f });
  linea(780, "ZZRET ABOGADOS ASOCIADOS S.L.P.", 14);
  linea(762, "NIF: B87654321");
  linea(744, "Passeig de Gracia 10, 08007 Barcelona");
  linea(710, "FACTURA Nº ZZRET-2026-014");
  linea(692, "Fecha: 15/09/2026");
  linea(658, "Cliente: Gestoria Valles SL");
  linea(624, "Concepto: Asistencia letrada expediente de extranjeria");
  linea(580, "Base imponible .................. 1.000,00 EUR");
  linea(560, "IVA 21% ........................... 210,00 EUR");
  linea(540, "Retencion IRPF 15% ............... -150,00 EUR");
  linea(514, "TOTAL A PAGAR ................... 1.060,00 EUR", 13);
  linea(470, "Forma de pago: transferencia");
  linea(452, "IBAN: ES91 2100 0418 4502 0005 1332");
  return Buffer.from(await doc.save());
}

try {
  console.log("\n1. Lectura real por la IA de una factura con retención");
  const pdf = await facturaPdf();
  const fd = new FormData();
  fd.set("file", new File([pdf], "zzret-abogados.pdf", { type: "application/pdf" }));
  const sub = await fetch(`${BASE}/api/facturas-recibidas`, { method: "POST", body: fd, headers: { Cookie: cookies } });
  const sj = await sub.json().catch(() => ({}));
  check("subida + lectura → 200", sub.status === 200, `${sub.status} ${JSON.stringify(sj).slice(0, 220)}`);
  const id = sj.facturas?.[0]?.id;
  if (id) creadas.push(id);
  const { data: f1 } = await admin.from("FacturaRecibida").select("*").eq("id", id).maybeSingle();
  check("la IA lee la retención (150) y su tipo (15)", Number(f1?.retencion) === 150 && Number(f1?.tipoRetencion) === 15, JSON.stringify({ r: f1?.retencion, t: f1?.tipoRetencion, base: f1?.baseImponible, iva: f1?.cuotaIva, total: f1?.total }));
  check("el total es el importe A PAGAR (1060), no base+IVA (1210)", Number(f1?.total) === 1060, String(f1?.total));
  check("base 1000 e IVA 210 intactos", Number(f1?.baseImponible) === 1000 && Number(f1?.cuotaIva) === 210, JSON.stringify({ b: f1?.baseImponible, c: f1?.cuotaIva }));
  check("ya NO se marca «revisar» por un falso descuadre", f1?.revisar === false, `revisar=${f1?.revisar} notas=${f1?.notas}`);

  console.log("\n2. La pantalla la enseña");
  const html = await (await fetch(`${BASE}/app/facturas?vista=recibidas`, { headers: { Cookie: cookies } })).text();
  check("la lista muestra la retención en negativo", /−150,00|-150,00/.test(html.replace(/ /g, " ")), html.includes("ZZRET") ? "aparece la factura pero no la línea" : "no aparece la factura");
  check("…y el proveedor", /ZZRET ABOGADOS/i.test(html));

  console.log("\n3. Corrección a mano por el gestor");
  let r = await api(`/api/facturas-recibidas/${id}`, { method: "PATCH", body: JSON.stringify({ retencion: "70", tipoRetencion: "7", total: "1140" }) });
  const { data: f2 } = await admin.from("FacturaRecibida").select("retencion, tipoRetencion, total, revisar").eq("id", id).maybeSingle();
  check("PATCH guarda retención 70 / 7 % / total 1140", r.status === 200 && Number(f2?.retencion) === 70 && Number(f2?.tipoRetencion) === 7 && Number(f2?.total) === 1140, JSON.stringify(f2));
  r = await api(`/api/facturas-recibidas/${id}`, { method: "PATCH", body: JSON.stringify({ retencion: "" }) });
  const { data: f3 } = await admin.from("FacturaRecibida").select("retencion").eq("id", id).maybeSingle();
  check("vaciar el campo la borra", r.status === 200 && f3?.retencion === null, JSON.stringify(f3));
  await api(`/api/facturas-recibidas/${id}`, { method: "PATCH", body: JSON.stringify({ retencion: "150", tipoRetencion: "15", total: "1060" }) });

  console.log("\n4. El dinero: la orden SEPA paga el total, no base+IVA");
  await admin.from("FacturaRecibida").update({ proveedorIban: "ES9121000418450200051332", estado: "PENDIENTE" }).eq("id", id);
  r = await api("/api/facturas-recibidas/orden-pago", { method: "POST", body: JSON.stringify({ ids: [id], fechaEjecucion: "2026-09-30" }) });
  const xml = typeof r.j?.xml === "string" ? r.j.xml : r.txt;
  check("la orden se genera", r.status === 200, `${r.status} ${JSON.stringify(r.j).slice(0, 160)}`);
  check("importe del adeudo = 1060.00 (y nunca 1210.00)", /InstdAmt[^>]*>1060\.00</.test(xml) && !/1210\.00/.test(xml), (xml.match(/InstdAmt[^>]*>[\d.]+</g) ?? []).join(" "));

  console.log("\n5. El ZIP para la contabilidad (lleva dentro facturas-recibidas.csv)");
  const zip = await fetch(`${BASE}/api/facturas-recibidas/export`, { headers: { Cookie: cookies } });
  const buf = Buffer.from(await zip.arrayBuffer());
  check("el export responde un .zip", zip.status === 200 && buf.slice(0, 2).toString() === "PK", `${zip.status} ${buf.slice(0, 40).toString("utf8")}`);
  check("…con facturas-recibidas.csv dentro", buf.includes(Buffer.from("facturas-recibidas.csv")));
} catch (e) {
  ko++; console.log("  ✗ excepción:", e instanceof Error ? e.message : e);
} finally {
  for (const id of creadas) {
    const { data } = await admin.from("FacturaRecibida").select("archivoPath").eq("id", id).maybeSingle();
    if (data?.archivoPath) await admin.storage.from("documentos").remove([data.archivoPath]).catch(() => {});
    await admin.from("FacturaRecibida").delete().eq("id", id);
  }
  const { count } = await admin.from("FacturaRecibida").select("id", { count: "exact", head: true }).eq("workspaceId", WS_DEMO).ilike("proveedorNombre", "ZZRET%");
  console.log(`\nlimpieza: ${creadas.length} facturas · restos ZZRET: ${count}`);
  console.log(`RESULTADO: ${ok} ok · ${ko} ko`);
  process.exit(ko ? 1 : 0);
}
