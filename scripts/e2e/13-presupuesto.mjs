// Presupuesto con el precio de ESTE expediente (pedido por Juan, 26/09/2026): el precio
// propio fijado al generar el presupuesto tiene que llegar IGUAL al PDF, al enlace del
// cliente y a la factura del anticipo — y el precio del catálogo no se mueve.
import { contexto, api, colector, verificador, admin, BASE } from "./_lib.mjs";

const eurTxt = (n) => n.toFixed(2).replace(".", ",");

async function textoPdf(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out += " " + c.items.map((x) => x.str).join(" ");
  }
  return out.replace(/\s+/g, " ");
}

export const nombre = "13 Presupuesto con precio propio";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { ws, madrid, cookie } = await contexto();
  try {
    // Un servicio del catálogo de la demo, para leer su precio antes y después.
    const { data: svs } = await admin.from("ServicioConfig").select("clave, anticipo, resto, oficinaId").eq("workspaceId", ws).eq("active", true).order("orden");
    const sv = (svs ?? []).find((s) => !s.oficinaId) ?? (svs ?? [])[0];
    if (!sv) { v.ok(false, "la demo no tiene servicios activos"); return v.resumen(); }

    const r1 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Presupuesto" }, oficinaId: madrid.id } });
    const id = r1.d.expedienteId;
    fx.expediente(id);
    const { data: exp } = await admin.from("Expediente").select("clienteId, portalToken").eq("id", id).maybeSingle();
    if (exp?.clienteId) fx.c.clientes.push(exp.clienteId);
    const rs = await api(`/api/expedientes/${id}/servicio`, { body: { clave: sv.clave } });
    v.ok(rs.status === 200, `servicio ${sv.clave} asignado (${rs.status} ${rs.d.error ?? ""})`);

    // 1) Precio propio + validez + nota.
    const propio = { anticipo: 123.45, resto: 76.55 };
    const rp = await api(`/api/expedientes/${id}/presupuesto`, { method: "PATCH", body: { tarifas: { [sv.clave]: propio }, opciones: { validezDias: 15, nota: "ZZE2E observaciones" } } });
    v.ok(rp.status === 200 && rp.d.ok, `PATCH presupuesto → 200 (${rp.status} ${rp.d.error ?? ""})`);

    // 2) El PDF del presupuesto dice ese precio, la nota y la validez.
    const rpdf = await fetch(`${BASE}/api/expedientes/${id}/encargo?doc=presupuesto`, { headers: { cookie } });
    const txt = rpdf.ok ? await textoPdf(Buffer.from(await rpdf.arrayBuffer())) : "";
    v.ok(txt.includes(`${eurTxt(propio.anticipo)} EUR`) && txt.includes(`${eurTxt(propio.resto)} EUR`) && txt.includes("200,00 EUR"), "PDF: al inicio 123,45 · al finalizar 76,55 · total 200,00");
    v.ok(txt.includes("OBSERVACIONES") && txt.includes("ZZE2E observaciones"), "PDF: observaciones impresas");
    const hasta = new Date(Date.now() + 15 * 864e5);
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    v.ok(txt.includes(`Válido hasta el ${hasta.getDate()} de ${MESES[hasta.getMonth()]}`), "PDF: válido 15 días");

    // 3) La hoja de encargo promete el mismo precio (sin nota ni validez).
    const rh = await fetch(`${BASE}/api/expedientes/${id}/encargo?doc=hoja`, { headers: { cookie } });
    const txtH = rh.ok ? await textoPdf(Buffer.from(await rh.arrayBuffer())) : "";
    v.ok(txtH.includes("200,00 EUR") && !txtH.includes("ZZE2E observaciones"), "hoja de encargo: mismo total, sin observaciones");

    // 4) El enlace del cliente recibe el precio propio (el carrito se pinta en el cliente: se
    //    comprueba en los datos que el servidor le pasa, donde viaja la tarifa del servicio).
    if (exp?.portalToken) {
      const html = await (await fetch(`${BASE}/j/${exp.portalToken}`)).text();
      v.ok(/anticipo\\*"\s*:\s*123\.45/.test(html) && /resto\\*"\s*:\s*76\.55/.test(html), "portal /j: el servicio llega con 123,45 + 76,55");
    } else v.ok(false, "sin portalToken");

    // 5) La factura del anticipo sale con el precio propio.
    const rf = await api("/api/pagos", { body: { expedienteId: id, momento: "ANTICIPO" } });
    if (rf.d.facturaId) fx.factura(rf.d.facturaId);
    const { data: f } = rf.d.facturaId ? await admin.from("Factura").select("baseImponible").eq("id", rf.d.facturaId).maybeSingle() : { data: null };
    v.ok(Number(f?.baseImponible) === propio.anticipo, `factura del anticipo: base ${f?.baseImponible ?? "?"} = ${propio.anticipo}`);

    // 6) El catálogo no se ha movido.
    const { data: svDespues } = await admin.from("ServicioConfig").select("anticipo, resto").eq("workspaceId", ws).eq("clave", sv.clave).is("oficinaId", sv.oficinaId ?? null).maybeSingle();
    v.ok(Number(svDespues?.anticipo) === Number(sv.anticipo) && Number(svDespues?.resto) === Number(sv.resto), "precio del servicio en Ajustes intacto");
  } finally { await fx.limpiar(); }
  return v.resumen();
}
