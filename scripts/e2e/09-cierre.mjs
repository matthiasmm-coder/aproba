// Flujo v4 (03/09/2026): el ciclo termina en la ENTREGA. «Marcar como preparado» →
// «Facturar y archivar» con salida → reclasificar desde Archivados → restaurar.
// Sin email en el cliente de prueba: ningún aviso sale. Vigía se comprueba y se limpia.
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "09 Cierre v4 (preparado · salida · reclasificar · restaurar)";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const vencimientosSembrados = [];
  try {
    const { madrid } = await contexto();
    const cli = await fx.cliente(); // SANS email : aucun aviso ne part
    // «Todas» es lectura: crear exige una sede concreta (a414d43).
    const r1 = await api("/api/expedientes", { body: { clienteId: cli, oficinaId: madrid.id } });
    const id = r1.d?.expedienteId ?? r1.d?.id;
    v.ok(r1.status === 200 && Boolean(id), `alta del expediente (${r1.status})`);
    if (!id) return v.resumen();
    fx.expediente(id);
    // Vigía siembra según la validez legal del TIPO de trámite: el alta sin servicio nace
    // como «OTRO» (sin validez) → se fija un trámite con validez conocida.
    await admin.from("Expediente").update({ tipo: "ARRAIGO_SOCIAL" }).eq("id", id);

    // 1) «Marcar como preparado» = validación manual → fase Preparado
    const r2 = await api(`/api/expedientes/${id}/validar`, { body: { validado: true } });
    const { data: e2 } = await admin.from("Expediente").select("validadoAt, estado, archivadoAt").eq("id", id).maybeSingle();
    v.ok(r2.status === 200 && Boolean(e2?.validadoAt) && !e2?.archivadoAt, `Marcar como preparado → validadoAt sellado, activo (${r2.status})`);

    // 2) «Facturar y archivar» con salida EN TRÁMITE → PRESENTADO + fechaPresentacion + archivado
    const r3 = await api(`/api/expedientes/${id}/cerrar`, { body: { salida: "en_tramite", avisar: false } });
    let sel = await admin.from("Expediente").select("estado, archivadoAt, fechaPresentacion, salida").eq("id", id).maybeSingle();
    if (sel.error) sel = await admin.from("Expediente").select("estado, archivadoAt, fechaPresentacion").eq("id", id).maybeSingle();
    const e3 = sel.data ?? {};
    v.ok(r3.status === 200 && e3.estado === "PRESENTADO" && Boolean(e3.archivadoAt) && Boolean(e3.fechaPresentacion),
         `cerrar en_tramite → PRESENTADO, archivado, fechaPresentacion sellada (${r3.status}, ${e3.estado})`);
    v.ok(r3.d?.salidaGuardada === false || e3.salida === "en_tramite", `salida guardada o repli declarado (salidaGuardada=${r3.d?.salidaGuardada}, salida=${e3.salida ?? "—"})`);
    const { data: ev } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", id).ilike("descripcion", "%archivado%");
    v.ok((ev ?? []).length >= 1, `evento de cierre en el historial (${(ev ?? []).length})`);

    // 3) reclasificar a CONCEDIDO (llegó la resolución) → FINALIZADO, sigue archivado, Vigía siembra
    const r4 = await api(`/api/expedientes/${id}/salida`, { body: { salida: "concedido" } });
    const { data: e4 } = await admin.from("Expediente").select("estado, archivadoAt").eq("id", id).maybeSingle();
    v.ok(r4.status === 200 && e4?.estado === "FINALIZADO" && Boolean(e4?.archivadoAt), `reclasificar concedido → FINALIZADO y sigue archivado (${r4.status}, ${e4?.estado})`);
    const { data: vs } = await admin.from("Vencimiento").select("id, fecha, estado").eq("expedienteId", id);
    for (const x of vs ?? []) vencimientosSembrados.push(x.id);
    v.ok((vs ?? []).length >= 1, `Vigía sembró la caducidad estimada (${(vs ?? []).length} vencimiento/s${vs?.[0]?.fecha ? ", " + String(vs[0].fecha).slice(0, 10) : ""})`);

    // 4) salida desconocida → 400 ; 5) restaurar → activo
    const r5 = await api(`/api/expedientes/${id}/salida`, { body: { salida: "loquesea" } });
    v.ok(r5.status === 400, `salida desconocida → 400 (${r5.status})`);
    const r6 = await api(`/api/expedientes/${id}/archivar`, { body: { archivado: false } });
    const { data: e6 } = await admin.from("Expediente").select("archivadoAt").eq("id", id).maybeSingle();
    v.ok(r6.status === 200 && !e6?.archivadoAt, `restaurar → vuelve al tablero (${r6.status})`);
  } catch (e) {
    v.ok(false, `excepción: ${e instanceof Error ? e.message : e}`);
  } finally {
    for (const vid of vencimientosSembrados) await admin.from("Vencimiento").delete().eq("id", vid);
    await fx.limpiar();
  }
  return v.resumen();
}
