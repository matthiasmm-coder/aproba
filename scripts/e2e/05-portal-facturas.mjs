// Portail /j vivant + série de facture par oficina.
import { contexto, api, colector, verificador } from "./_lib.mjs";
import { BASE } from "./_lib.mjs";

export const nombre = "05 Portal /j + serie por oficina";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { zaragoza, cookie } = await contexto();
  try {
    const r1 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Portal" }, oficinaId: zaragoza.id } });
    fx.expediente(r1.d.expedienteId);
    if (r1.d.expedienteId) {
      const { data: exp } = await import("./_lib.mjs").then((m) => m.admin.from("Expediente").select("clienteId").eq("id", r1.d.expedienteId).maybeSingle());
      if (exp?.clienteId) fx.c.clientes.push(exp.clienteId);
    }
    const token = r1.d.portalToken;
    if (token) {
      const rp = await fetch(`${BASE}/j/${token}`);
      const html = await rp.text();
      v.ok(rp.status === 200 && /ZZE2E/.test(html), `portal /j/{token} → 200 + nombre du client (${rp.status})`);
    } else v.ok(false, `pas de portalToken (${r1.status}: ${r1.d.error})`);

    const rn = await fetch(`${BASE}/api/facturas/numero?oficina=${encodeURIComponent(zaragoza.id)}`, { headers: { cookie: `${cookie}; aproba_oficina=todas` } });
    const dn = await rn.json().catch(() => ({}));
    v.ok(rn.status === 200 && /\d{4}/.test(String(dn.numero ?? "")), `próximo número de la serie de la sede → ${dn.numero ?? "??"}`);
  } finally { await fx.limpiar(); }
  return v.resumen();
}
