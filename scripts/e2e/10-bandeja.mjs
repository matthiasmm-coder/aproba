// Recepción de documentos por email (03/09/2026): la BANDEJA. No se puede simular un
// email real sin el MX, así que se siembra lo que el webhook dejaría (fila PENDIENTE +
// adjunto en el bucket) y se ejercita lo que sigue: asignar a la ficha, asignar a un
// expediente (Vision clasifica el adjunto), ver el adjunto, descartar. Todo reversible.
import { contexto, api, colector, verificador, admin } from "./_lib.mjs";

export const nombre = "10 Bandeja de entrada (asignar ficha · asignar expediente · adjunto · descartar)";

// PDF mínimo válido (una página en blanco) — suficiente para el bucket y para Vision.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n",
);

export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const filas = [];
  const rutas = [];
  const docsCliente = [];
  try {
    const { ws, madrid } = await contexto();
    const cli = await fx.cliente();

    const sembrar = async (etiqueta) => {
      const emailId = `e2e-${crypto.randomUUID()}`;
      const storagePath = `bandeja/${ws}/${emailId}/0-ZZE2E-${etiqueta}.pdf`;
      const up = await admin.storage.from("documentos").upload(storagePath, PDF, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`storage: ${up.error.message}`);
      rutas.push(storagePath);
      const id = crypto.randomUUID();
      const { error } = await admin.from("BandejaEntrada").insert({
        id, workspaceId: ws, resendEmailId: emailId, remitente: "zze2e@example.com", remitenteNombre: "ZZE2E Remitente",
        asunto: `ZZE2E ${etiqueta}`, texto: "Adjunto documentación.", recibidoAt: new Date().toISOString(),
        adjuntos: [{ nombre: `ZZE2E-${etiqueta}.pdf`, mime: "application/pdf", size: PDF.length, storagePath }], estado: "PENDIENTE", motivo: "sin coincidencia",
      });
      if (error) throw new Error(`BandejaEntrada: ${error.message}${/relation|schema cache/i.test(error.message) ? " (¿migración supabase/email-entrante.sql?)" : ""}`);
      filas.push(id);
      return id;
    };

    // 1) Asignar a la FICHA (el cliente no tiene expediente vivo) → DocumentoCliente
    const f1 = await sembrar("ficha");
    const r1 = await api(`/api/bandeja/${f1}`, { body: { clienteId: cli } });
    const { data: dc } = await admin.from("DocumentoCliente").select("id, tipo, storagePath").eq("clienteId", cli);
    for (const d of dc ?? []) { docsCliente.push(d.id); rutas.push(d.storagePath); }
    v.ok(r1.status === 200 && r1.d?.destino === "cliente" && (dc ?? []).length === 1, `asignar sin expediente → documento suelto en la ficha (${r1.status}, ${r1.d?.destino}, tipo ${dc?.[0]?.tipo ?? "—"})`);
    const { data: b1 } = await admin.from("BandejaEntrada").select("estado, clienteId, adjuntos").eq("id", f1).maybeSingle();
    v.ok(b1?.estado === "ASIGNADO" && b1?.clienteId === cli && b1?.adjuntos?.[0]?.docId, `la fila queda ASIGNADO con el docId del adjunto`);

    // 2) Ver el adjunto (sesión + RLS)
    const { cookie } = await contexto();
    const ra = await fetch(`${process.env.E2E_BASE_URL ?? "https://aproba-software.com"}/api/bandeja/${f1}/adjunto/0`, { headers: { cookie } });
    v.ok(ra.status === 200 && (ra.headers.get("content-type") ?? "").includes("pdf"), `adjunto descargable (${ra.status}, ${ra.headers.get("content-type")})`);

    // 3) Asignar a un EXPEDIENTE vivo → Documento del expediente (Vision clasifica)
    const rx = await api("/api/expedientes", { body: { clienteId: cli, oficinaId: madrid.id } });
    const expId = rx.d?.expedienteId ?? rx.d?.id;
    fx.expediente(expId);
    const f2 = await sembrar("expediente");
    const r2 = await api(`/api/bandeja/${f2}`, { body: { clienteId: cli, expedienteId: expId } });
    const { data: docsExp } = await admin.from("Documento").select("id, tipo, estado, storagePath").eq("expedienteId", expId);
    for (const d of docsExp ?? []) if (d.storagePath) rutas.push(d.storagePath);
    v.ok(r2.status === 200 && r2.d?.destino === "expediente" && (docsExp ?? []).length >= 1, `asignar a expediente → documento en sus casillas (${r2.status}, ${r2.d?.destino}, ${(docsExp ?? []).map((d) => `${d.tipo}/${d.estado}`).join(",") || "—"})`);
    const { data: evs } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", expId).ilike("descripcion", "%bandeja%");
    v.ok((evs ?? []).length >= 1, `evento «desde la bandeja» en el historial (${(evs ?? []).length})`);

    // 4) Cliente ajeno → 400 ; 5) Descartar → DESCARTADO y adjunto borrado del bucket
    const f3 = await sembrar("descartar");
    const r3 = await api(`/api/bandeja/${f3}`, { body: { clienteId: "no-existe" } });
    v.ok(r3.status === 400, `cliente inexistente → 400 (${r3.status})`);
    const r4 = await api(`/api/bandeja/${f3}`, { method: "DELETE" });
    const { data: b3 } = await admin.from("BandejaEntrada").select("estado, adjuntos").eq("id", f3).maybeSingle();
    const { data: lst } = await admin.storage.from("documentos").list(`bandeja/${ws}/${b3 ? "" : ""}`);
    const quedan = (lst ?? []).some((o) => o.name.includes("descartar"));
    v.ok(r4.status === 200 && b3?.estado === "DESCARTADO", `descartar → DESCARTADO (${r4.status}, ${b3?.estado})${quedan ? " · ⚠️ adjunto aún en el bucket" : ""}`);

    // 6) Sin sesión → 401
    const r5 = await fetch(`${process.env.E2E_BASE_URL ?? "https://aproba-software.com"}/api/bandeja/${f1}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    v.ok(r5.status === 401, `sin sesión → 401 (${r5.status})`);
  } catch (e) {
    v.ok(false, `excepción: ${e instanceof Error ? e.message : e}`);
  } finally {
    for (const d of docsCliente) await admin.from("DocumentoCliente").delete().eq("id", d);
    for (const e of fx.c.expedientes) await admin.from("Documento").delete().eq("expedienteId", e);
    for (const f of filas) await admin.from("BandejaEntrada").delete().eq("id", f);
    if (rutas.length) await admin.storage.from("documentos").remove(rutas).catch(() => {});
    await fx.limpiar();
  }
  return v.resumen();
}
