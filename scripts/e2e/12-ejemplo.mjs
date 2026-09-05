// Expediente de EJEMPLO (05/09/2026): el «ajá» de los primeros diez minutos. Se prueba
// que se siembra entero (4 documentos VALIDADO con archivo, 4 extracciones, diario),
// que es idempotente, que NO contamina la memoria de actividad, y que se borra del todo
// (archivos del bucket y cliente ficticio incluidos). Reversible: termina como empezó.
import { contexto, api, verificador, admin, BASE } from "./_lib.mjs";

export const nombre = "12 Expediente de ejemplo (sembrar · idempotente · fuera de la memoria · borrar)";

export async function run() {
  const v = verificador(nombre);
  let expId = null;
  try {
    const { ws, cookie } = await contexto();
    const hoy = new Date().toISOString().slice(0, 10);
    const memoria = async () => (await fetch(`${BASE}/api/memoria?desde=${hoy}&hasta=${hoy}&formato=json`, { headers: { cookie } })).json();

    // Estado inicial limpio (por si una ejecución anterior falló a medias).
    await api("/api/ejemplo", { method: "DELETE" });
    const antes = await memoria();

    // 1) Sembrar
    const r1 = await api("/api/ejemplo");
    expId = r1.d?.expedienteId;
    v.ok(r1.status === 200 && r1.d?.creado === true && expId, `POST siembra el ejemplo (${r1.status}, creado ${r1.d?.creado})`);

    const { data: exp } = await admin.from("Expediente").select("referencia, tipo, estado, clienteId").eq("id", expId).maybeSingle();
    v.ok(exp?.referencia === "EJEMPLO" && exp?.tipo === "RENOVACION", `referencia EJEMPLO, renovación de TIE (${exp?.referencia}, ${exp?.tipo})`);
    const { data: cli } = await admin.from("Cliente").select("email, numeroDocumento, pasaporte").eq("id", exp?.clienteId).maybeSingle();
    v.ok(cli?.email === "ejemplo@aproba-software.com" && cli?.numeroDocumento && cli?.pasaporte, `cliente ficticio con ficha completa (${cli?.email}, NIE ${cli?.numeroDocumento})`);
    const { data: docs } = await admin.from("Documento").select("id, estado, storagePath, tipo").eq("expedienteId", expId);
    v.ok((docs ?? []).length === 4 && docs.every((d) => d.estado === "VALIDADO" && d.storagePath), `4 documentos VALIDADO con archivo (${(docs ?? []).map((d) => d.tipo).join(", ")})`);
    const { count: ext } = await admin.from("Extraction").select("id", { count: "exact", head: true }).in("documentoId", (docs ?? []).map((d) => d.id));
    v.ok(ext === 4, `4 extracciones con datos (${ext})`);
    const { data: files } = await admin.storage.from("documentos").list(expId, { limit: 50 });
    v.ok((files ?? []).length === 4, `4 archivos copiados al bucket bajo <id>/ (${(files ?? []).length})`);
    const { data: evs } = await admin.from("ExpedienteEvento").select("tipo, descripcion").eq("expedienteId", expId);
    v.ok((evs ?? []).length === 11 && !evs.some((e) => /El cliente subió/.test(e.descripcion)), `diario: 1 alta + 4 subidas del despacho + 4 validaciones + cita + factura, ninguna atribuida al cliente (${(evs ?? []).length})`);
    // 06/09: cita fijada y anticipo facturado en la serie EJEMPLO-… (fuera de la serie legal 2026-…)
    const { data: cita } = await admin.from("Expediente").select("fechaCita, citaHora, citaLugar").eq("id", expId).maybeSingle();
    v.ok(Boolean(cita?.fechaCita) && cita?.citaHora === "10:30" && /Extranjería/.test(cita?.citaLugar ?? ""), `cita fijada en el ejemplo (${cita?.fechaCita} ${cita?.citaHora})`);
    const { data: fac } = await admin.from("Factura").select("numero, estado, momento, total").eq("expedienteId", expId);
    v.ok((fac ?? []).length === 1 && fac[0].numero === "EJEMPLO-0001" && fac[0].estado === "EMITIDA" && fac[0].momento === "ANTICIPO", `anticipo facturado y pendiente, número fuera de la serie legal (${fac?.[0]?.numero}, ${fac?.[0]?.estado}, ${fac?.[0]?.total} €)`);

    // 2) Idempotente
    const r2 = await api("/api/ejemplo");
    v.ok(r2.status === 200 && r2.d?.creado === false && r2.d?.expedienteId === expId, `segunda llamada devuelve el mismo, sin duplicar (${r2.d?.creado}, mismo id ${r2.d?.expedienteId === expId})`);
    const { count: nEj } = await admin.from("Expediente").select("id", { count: "exact", head: true }).eq("workspaceId", ws).eq("referencia", "EJEMPLO");
    v.ok(nEj === 1, `un solo EJEMPLO en el despacho (${nEj})`);

    // 3) Fuera de la memoria de actividad
    const despues = await memoria();
    v.ok(despues.expedientesTramitados === antes.expedientesTramitados && despues.personasAtendidas === antes.personasAtendidas,
      `la memoria no lo cuenta (tramitados ${antes.expedientesTramitados} → ${despues.expedientesTramitados}, personas ${antes.personasAtendidas} → ${despues.personasAtendidas})`);

    // 4) Borrar del todo
    const r3 = await api("/api/ejemplo", { method: "DELETE" });
    const { data: expB } = await admin.from("Expediente").select("id").eq("id", expId).maybeSingle();
    const { data: filesB } = await admin.storage.from("documentos").list(expId, { limit: 50 });
    const { count: cliB } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", ws).eq("email", "ejemplo@aproba-software.com");
    v.ok(r3.status === 200 && r3.d?.borrado === true && !expB && (filesB ?? []).length === 0 && cliB === 0,
      `DELETE borra expediente, archivos y cliente ficticio (${r3.status}, exp ${expB ? "queda" : "fuera"}, archivos ${(filesB ?? []).length}, cliente ${cliB})`);
    const { count: facB } = await admin.from("Factura").select("id", { count: "exact", head: true }).eq("expedienteId", expId);
    v.ok(facB === 0, `DELETE borra también la factura de ejemplo (${facB})`);
    expId = null;

    // 5) Sin sesión → 401
    const anon = await fetch(`${BASE}/api/ejemplo`, { method: "POST" });
    v.ok(anon.status === 401, `sin sesión → 401 (${anon.status})`);
  } catch (e) {
    v.ok(false, `excepción: ${e instanceof Error ? e.message : e}`);
  } finally {
    if (expId) { try { await api("/api/ejemplo", { method: "DELETE" }); } catch { /* */ } }
  }
  return v.resumen();
}
