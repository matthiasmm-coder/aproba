// «Iniciar renovación» (Vigía) : cliente sans sede → 400 depuis Todas, adoption via pastille.
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "03 Renovación Vigía (adopción)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { madrid } = await contexto();
  try {
    const cli = await fx.cliente(); // SANS email : aucun aviso ne part
    const venc = await fx.vencimiento(cli);

    const r1 = await api(`/api/vencimientos/${venc}/renovar`);
    v.ok(r1.status === 400 && /no tiene oficina/i.test(r1.d.error ?? ""), "renovar sin sede en Todas → 400");

    const r2 = await api(`/api/vencimientos/${venc}/renovar`, { sede: madrid.id });
    fx.expediente(r2.d.expedienteId);
    if (r2.d.expedienteId) {
      const { data: c } = await admin.from("Cliente").select("oficinaId").eq("id", cli).maybeSingle();
      const { data: e } = await admin.from("Expediente").select("oficinaId").eq("id", r2.d.expedienteId).maybeSingle();
      v.ok(c?.oficinaId === madrid.id && e?.oficinaId === madrid.id, "pastilla Madrid → adopta + estampa expediente");
    } else v.ok(false, `renovar avec pastille → échec (${r2.status}: ${r2.d.error})`);
  } finally { await fx.limpiar(); }
  return v.resumen();
}
