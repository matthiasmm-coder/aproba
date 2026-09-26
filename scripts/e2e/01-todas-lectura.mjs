// «Todas» = vue de LECTURE : créer un expediente exige une oficina concrète.
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "01 Todas = lectura (expedientes)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { zaragoza, madrid, multiSede } = await contexto();
  // Mono-oficina: lo creado «sin sede» existe de verdad → se apunta para el nettoyage.
  const apuntar = async (expId) => {
    if (!expId) return;
    fx.expediente(expId);
    const { data: e } = await admin.from("Expediente").select("clienteId, familiaId").eq("id", expId).maybeSingle();
    if (e?.clienteId) fx.c.clientes.push(e.clienteId);
    if (e?.familiaId) {
      fx.c.familias.push(e.familiaId);
      const { data: ms } = await admin.from("Cliente").select("id").eq("familiaId", e.familiaId);
      for (const m of ms ?? []) if (!fx.c.clientes.includes(m.id)) fx.c.clientes.push(m.id);
    }
  };
  try {
    const r1 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Uno" } } });
    if (multiSede) v.ok(r1.status === 400 && /solo lectura/i.test(r1.d.error ?? ""), `cliente nuevo en Todas sin sede → 400 (${r1.status})`);
    else { await apuntar(r1.d.expedienteId); v.ok(r1.status === 200 && Boolean(r1.d.expedienteId), `mono-oficina: cliente nuevo sin elegir sede → se crea (${r1.status})`); }

    const r2 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Dos" }, oficinaId: zaragoza.id } });
    fx.expediente(r2.d.expedienteId);
    if (r2.d.expedienteId) {
      const { data: exp } = await admin.from("Expediente").select("oficinaId, clienteId").eq("id", r2.d.expedienteId).maybeSingle();
      if (exp?.clienteId) fx.c.clientes.push(exp.clienteId);
      const { data: cli } = await admin.from("Cliente").select("oficinaId").eq("id", exp?.clienteId ?? "").maybeSingle();
      v.ok(exp?.oficinaId === zaragoza.id && cli?.oficinaId === zaragoza.id, "oficinaId explícito → cliente y expediente estampados");
    } else v.ok(false, `oficinaId explícito → création échouée (${r2.status}: ${r2.d.error})`);

    const r3 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Tres" }, oficinaId: "ofi_bidon" } });
    v.ok(r3.status === 400 && /no es válida/i.test(r3.d.error ?? ""), "oficinaId forgé → 400 no válida");

    const r4 = await api("/api/expedientes", { sede: madrid.id, body: { nuevo: { nombre: "ZZE2E", apellidos: "Cuatro" } } });
    fx.expediente(r4.d.expedienteId);
    if (r4.d.expedienteId) {
      const { data: exp } = await admin.from("Expediente").select("oficinaId, clienteId").eq("id", r4.d.expedienteId).maybeSingle();
      if (exp?.clienteId) fx.c.clientes.push(exp.clienteId);
      v.ok(exp?.oficinaId === madrid.id, "pastilla activa (cookie) → estampage sans body");
    } else v.ok(false, `pastilla active → échec (${r4.status})`);

    const r5 = await api("/api/expedientes", { body: { familiaNueva: { nombre: "ZZE2E Fam", titular: { nombre: "T" } } } });
    if (multiSede) v.ok(r5.status === 400, "familiaNueva en Todas sin sede → 400");
    else { await apuntar(r5.d.expedienteId); v.ok(r5.status === 200 && Boolean(r5.d.expedienteId), `mono-oficina: familia nueva sin elegir sede → se crea (${r5.status})`); }
  } finally { await fx.limpiar(); }
  return v.resumen();
}
