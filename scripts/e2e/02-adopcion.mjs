// Cliente/familia EXISTANTS sans sede : la création adopte (ou refuse depuis «Todas»).
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "02 Adopción (existente sin sede)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { ws, madrid, zaragoza } = await contexto();
  try {
    const c1 = await fx.cliente();
    const r1 = await api("/api/expedientes", { body: { clienteId: c1 } });
    v.ok(r1.status === 400 && /no tiene oficina/i.test(r1.d.error ?? ""), "existente sin sede en Todas → 400");

    const r2 = await api("/api/expedientes", { body: { clienteId: c1, oficinaId: madrid.id } });
    fx.expediente(r2.d.expedienteId);
    const { data: cli2 } = await admin.from("Cliente").select("oficinaId").eq("id", c1).maybeSingle();
    v.ok(cli2?.oficinaId === madrid.id, "elección → el cliente queda ADOPTADO en Madrid");

    const c3 = await fx.cliente({ oficinaId: zaragoza.id });
    const r3 = await api("/api/expedientes", { body: { clienteId: c3 } });
    fx.expediente(r3.d.expedienteId);
    if (r3.d.expedienteId) {
      const { data: exp } = await admin.from("Expediente").select("oficinaId").eq("id", r3.d.expedienteId).maybeSingle();
      v.ok(exp?.oficinaId === zaragoza.id, "cliente CON sede → hereda sin preguntar (régression)");
    } else v.ok(false, `cliente con sede refusé à tort (${r3.status}: ${r3.d.error})`);

    const fam = await fx.familia();
    await fx.cliente({ familiaId: fam, parentesco: "TITULAR" });
    await fx.cliente({ familiaId: fam, parentesco: "CONYUGE" });
    const r4 = await api("/api/expedientes", { body: { familiaExistenteId: fam } });
    v.ok(r4.status === 400 && /familia no tiene oficina/i.test(r4.d.error ?? ""), "familia sin sede en Todas → 400");

    const r5 = await api("/api/expedientes", { body: { familiaExistenteId: fam, oficinaId: madrid.id } });
    fx.expediente(r5.d.expedienteId);
    const { data: miembros } = await admin.from("Cliente").select("oficinaId").eq("familiaId", fam).eq("workspaceId", ws);
    v.ok((miembros ?? []).length > 0 && miembros.every((m) => m.oficinaId === madrid.id), "familia adoptada ENTERA en Madrid");
  } finally { await fx.limpiar(); }
  return v.resumen();
}
