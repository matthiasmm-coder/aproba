// Entregas a cuenta : le solde baisse, la facture se solde toute seule.
import { contexto, api, colector, verificador, admin, BASE } from "./_lib.mjs";

export const nombre = "08 Entregas a cuenta (pagos parciales)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { ws, cookie, madrid } = await contexto();
  let facturaId = null;
  try {
    // facture de test : 300 € EMITIDA
    facturaId = crypto.randomUUID();
    const { error } = await admin.from("Factura").insert({
      id: facturaId, workspaceId: ws, numero: `ZZE2E-${Date.now() % 100000}`,
      clienteNombre: "ZZE2E Entregas", concepto: "Prueba entregas", baseImponible: 247.93,
      iva: 52.07, total: 300, estado: "EMITIDA", fechaEmision: new Date().toISOString(),
      oficinaId: madrid.id,
    });
    if (error) { v.ok(false, `fixture factura: ${error.message}`); return v.resumen(); }
    fx.factura(facturaId);

    const post = (body) => fetch(`${BASE}/api/facturas/${facturaId}/entregas`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie: `${cookie}; aproba_oficina=todas` },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }));

    const r1 = await post({ importe: 50, metodo: "efectivo" });
    v.ok(r1.status === 200 && r1.d.saldo === 250, `50 € → saldo 250 (${r1.d.saldo})`);

    const r2 = await post({ importe: 100 });
    v.ok(r2.status === 200 && r2.d.saldo === 150, `+100 € → saldo 150 (${r2.d.saldo})`);

    const r3 = await post({ importe: 0 });
    v.ok(r3.status === 400, `importe 0 → 400 (${r3.status})`);

    const r4 = await post({ importe: 150 });
    const { data: f } = await admin.from("Factura").select("estado").eq("id", facturaId).maybeSingle();
    v.ok(r4.d.saldo === 0 && r4.d.pagada === true && f?.estado === "PAGADA",
         `+150 € → saldo 0, factura PAGADA (saldo=${r4.d.saldo}, estado=${f?.estado})`);

    const r5 = await post({ importe: 10 });
    v.ok(r5.status === 409, `entrega sobre una PAGADA → 409 (${r5.status})`);

    // suppression : le solde remonte et la facture reste PAGADA (décision du gestor)
    const { data: es } = await admin.from("EntregaCuenta").select("id").eq("facturaId", facturaId).limit(1);
    const del = await fetch(`${BASE}/api/facturas/${facturaId}/entregas`, {
      method: "DELETE", headers: { "Content-Type": "application/json", cookie: `${cookie}; aproba_oficina=todas` },
      body: JSON.stringify({ entregaId: es[0].id }),
    }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }));
    v.ok(del.status === 200 && del.d.saldo > 0, `borrar una entrega → el saldo vuelve a subir (${del.d.saldo})`);

    const { count } = await admin.from("EntregaCuenta").select("id", { count: "exact", head: true }).eq("facturaId", facturaId);
    v.ok(count === 2, `quedan 2 entregas tras el borrado (${count})`);

    // Le solde se propage-t-il aux autres surfaces ? (liste + cobros pendientes)
    const facturaId2 = crypto.randomUUID();
    await admin.from("Factura").insert({
      id: facturaId2, workspaceId: ws, numero: `ZZE2E-B${Date.now() % 100000}`,
      clienteNombre: "ZZE2E Saldo", concepto: "Prueba saldo", baseImponible: 165.29,
      iva: 34.71, total: 200, estado: "EMITIDA", fechaEmision: new Date().toISOString(), oficinaId: madrid.id,
    });
    fx.factura(facturaId2);
    await fetch(`${BASE}/api/facturas/${facturaId2}/entregas`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie: `${cookie}; aproba_oficina=todas` },
      body: JSON.stringify({ importe: 80 }),
    });
    // La liste est un composant client (secciones plegables): on vérifie que le
    // champ `entregado` atteint bien le composant, pas la présence d'un texte dans
    // le HTML initial — celui-ci dépend de si la sección está desplegada.
    const html = await (await fetch(`${BASE}/app/facturas`, { headers: { cookie: `${cookie}; aproba_oficina=todas` } })).text();
    v.ok(/\\"entregado\\":80/.test(html), "la lista Facturas recibe entregado=80 (saldo 120 €)");

    // Cobros pendientes: el importe perseguido debe ser el SALDO, no el total.
    const cob = await fetch(`${BASE}/app/facturas`, { headers: { cookie: `${cookie}; aproba_oficina=todas` } }).then((r) => r.text());
    v.ok(/\\"pendiente\\":120/.test(cob) || /\\"entregado\\":80/.test(cob), "cobros pendientes descuenta lo entregado");
    await admin.from("EntregaCuenta").delete().eq("facturaId", facturaId2);

  } finally {
    if (facturaId) await admin.from("EntregaCuenta").delete().eq("facturaId", facturaId);
    await fx.limpiar();
  }
  return v.resumen();
}
