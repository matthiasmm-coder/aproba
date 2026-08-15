// Citas : sin cliente depuis «Todas» → sede obligatoire ; la factura de la cita suit la sede.
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "04 Citas (sede de la factura)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { zaragoza, madrid } = await contexto();
  const base = { nombre: "ZZE2E Cita", fecha: "2026-09-01", hora: "10:00", duracion: 30, notificar: false };
  const borrarCita = async (id) => { if (id) await admin.from("CitaPrevia").delete().eq("id", id); };
  let c1 = null, c2 = null;
  try {
    const r1 = await api("/api/citas-previas", { body: { ...base } });
    v.ok(r1.status === 400 && /Elige la oficina/i.test(r1.d.error ?? ""), "cita sin cliente en Todas → 400");

    const r2 = await api("/api/citas-previas", { body: { ...base, oficinaId: zaragoza.id, precio: 60, email: "zze2e@example.com", cobrar: true, cobroTransferencia: true } });
    c1 = r2.d.id ?? null;
    if (c1) {
      const { data: cita } = await admin.from("CitaPrevia").select("facturaId").eq("id", c1).maybeSingle();
      let fact = null;
      if (cita?.facturaId) { ({ data: fact } = await admin.from("Factura").select("id, oficinaId").eq("id", cita.facturaId).maybeSingle()); fx.factura(fact?.id); }
      v.ok(fact?.oficinaId === zaragoza.id, "cita + cobro con oficinaId → factura en Zaragoza");
    } else v.ok(false, `création cita échouée (${r2.status}: ${r2.d.error})`);

    const r3 = await api("/api/citas-previas", { body: { ...base, oficinaId: "ofi_bidon" } });
    v.ok(r3.status === 400 && /no es válida/i.test(r3.d.error ?? ""), "oficinaId forgé → 400");

    const cliMadrid = await fx.cliente({ oficinaId: madrid.id });
    const r4 = await api("/api/citas-previas", { body: { ...base, clienteId: cliMadrid, precio: 60, email: "zze2e@example.com", cobrar: true, cobroTransferencia: true } });
    c2 = r4.d.id ?? null;
    if (c2) {
      const { data: cita } = await admin.from("CitaPrevia").select("facturaId").eq("id", c2).maybeSingle();
      let fact = null;
      if (cita?.facturaId) { ({ data: fact } = await admin.from("Factura").select("id, oficinaId").eq("id", cita.facturaId).maybeSingle()); fx.factura(fact?.id); }
      v.ok(fact?.oficinaId === madrid.id, "cita con cliente de Madrid → pasa sin selector, factura Madrid");
    } else v.ok(false, `cita avec cliente refusée à tort (${r4.status}: ${r4.d.error})`);
  } finally { await borrarCita(c1); await borrarCita(c2); await fx.limpiar(); }
  return v.resumen();
}
