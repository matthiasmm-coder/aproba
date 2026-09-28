// DEHú (28/09/2026): una notificación descargada de la DEHú (PDF sintético ZZE2E, datos
// ficticios) → subida directa al bucket de entrada → lectura IA → expediente PROPUESTO por
// su nº oficial → vincular → registrar el requerimiento → gestionada. Más: el mismo PDF
// dentro de un ZIP no se duplica, lo que no es una notificación queda en «Ignoradas» y se
// puede eliminar, la campana la enseña mientras está pendiente, la ficha la lista, y la
// carpeta de entrada queda vacía. Todo en el ws de test, limpiado en finally.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { contexto, api, colector, verificador, admin, BASE } from "./_lib.mjs";

const NUM = "089920269999991";
const NIE = "Z9999999R";

async function pdfDe(paginas) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const lineas of paginas) {
    const p = doc.addPage([595, 842]);
    let y = 790;
    for (const l of lineas) {
      const negrita = l.startsWith("**");
      p.drawText(l.replace(/^\*\*/, ""), { x: 50, y, size: negrita ? 12 : 10, font: negrita ? fb : f });
      y -= negrita ? 20 : 15;
    }
  }
  // Fecha fija: dos ejecuciones generan el MISMO PDF (el dedup por huella se prueba aparte).
  doc.setCreationDate(new Date("2026-09-21T10:00:00Z")); doc.setModificationDate(new Date("2026-09-21T10:00:00Z"));
  return Buffer.from(await doc.save());
}

// ZIP «store» mínimo (con CRC32), como los que descarga la DEHú o comprime Windows.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(entradas) {
  const locales = [], centrales = [];
  let off = 0;
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, "utf8"), crc = crc32(datos);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(0, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(datos.length, 18); l.writeUInt32LE(datos.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(datos.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locales.push(l, n, datos); centrales.push(c, n);
    off += 30 + n.length + datos.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// Paso 1 (URL firmada) + subida directa + paso 2 (lectura), como la pestaña DEHú.
async function importar(buf, nombre, tipo) {
  const s = await api("/api/dehu/subida", { body: { nombre, size: buf.length } });
  if (s.status !== 200) return { status: s.status, d: s.d };
  const up = await admin.storage.from("dehu-entrada").uploadToSignedUrl(s.d.path, s.d.token, buf, { contentType: tipo });
  if (up.error) return { status: 500, d: { error: `subida: ${up.error.message}` } };
  return api("/api/dehu/importar", { body: { path: s.d.path, nombre } });
}

export const nombre = "15 DEHú: importar, proponer, vincular, registrar";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { ws, cookie } = await contexto();
  const notifIds = new Set();
  let expId = null;
  try {
    const prueba = await admin.from("NotificacionDehu").select("id").limit(1);
    if (prueba.error) { v.ok(false, `migración supabase/notificaciones-dehu.sql (${prueba.error.message})`); return v.resumen(); }

    // Fixture: cliente con NIE + expediente con su nº oficial.
    const r1 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Dehuprueba" } } });
    expId = r1.d.expedienteId;
    fx.expediente(expId);
    const { data: exp } = await admin.from("Expediente").select("clienteId").eq("id", expId).maybeSingle();
    if (exp?.clienteId) { fx.c.clientes.push(exp.clienteId); await admin.from("Cliente").update({ numeroDocumento: NIE }).eq("id", exp.clienteId); }
    const up = await admin.from("Expediente").update({ numeroOficial: NUM }).eq("id", expId);
    v.ok(r1.status === 200 && !up.error, `fixture: expediente con nº oficial (${r1.status} ${up.error?.message ?? ""})`);

    const requerimiento = await pdfDe([[
      "**MINISTERIO DE INCLUSIÓN, SEGURIDAD SOCIAL Y MIGRACIONES",
      "Delegación del Gobierno en Cataluña · Oficina de Extranjería de Barcelona",
      "",
      "**REQUERIMIENTO DE DOCUMENTACIÓN",
      `Expediente nº: ${NUM}`,
      "Procedimiento: autorización de residencia temporal por circunstancias excepcionales (arraigo sociolaboral)",
      `Interesado: ZZE2E DEHUPRUEBA · NIE ${NIE} · Pasaporte ZZ1234567`,
      "Representante: Gestoría Vallès (a efectos de notificaciones)",
      "",
      "De conformidad con el artículo 68 de la Ley 39/2015, se le requiere para que, en el plazo de DIEZ DÍAS",
      "a contar desde el día siguiente a la recepción de esta notificación, aporte:",
      "1. Contrato de trabajo firmado por ambas partes.",
      "2. Informe de vida laboral actualizado.",
      "3. Justificante del pago de la tasa modelo 790 código 052.",
      "Si no lo hiciera, se le tendrá por desistido de su petición, previa resolución.",
      "",
      "Barcelona, 21 de septiembre de 2026. La Jefa de la Oficina de Extranjería.",
      "CSV: ZZE2ECSV0001",
    ], [
      "**JUSTIFICANTE DE NOTIFICACIÓN · Dirección Electrónica Habilitada única (DEHú)",
      "Identificador de la notificación: ZZE2E-N-0001",
      "Organismo emisor: Oficina de Extranjería de Barcelona",
      "Fecha de puesta a disposición: 22/09/2026",
      "Fecha de acceso (notificación practicada): 23/09/2026",
    ]]);

    // 1) Importar: requerimiento, propuesto a SU expediente por el nº oficial, con plazo.
    const i1 = await importar(requerimiento, "notificacion-zze2e.pdf", "application/pdf");
    const n1 = i1.d.fila;
    if (n1?.id) notifIds.add(n1.id);
    v.ok(i1.status === 200 && i1.d.estado === "importada", `importar → importada (${i1.status} ${i1.d.error ?? i1.d.estado ?? ""})`);
    v.ok(n1?.tipo === "REQUERIMIENTO", `la IA lo lee como requerimiento (${n1?.tipo})`);
    v.ok(n1?.sugerencia?.expedienteId === expId && n1?.sugerencia?.motivo === "nº de expediente", `propuesto a su expediente por el nº oficial (${n1?.sugerencia?.motivo ?? "sin propuesta"})`);
    v.ok(n1?.nie === NIE && n1?.numeroExpediente === NUM, `NIE y nº de expediente leídos (${n1?.nie} · ${n1?.numeroExpediente})`);
    v.ok(n1?.fechaNotificacion === "2026-09-23" && String(n1?.fechaLimite ?? "").slice(0, 10) === "2026-10-07", `plazo: 10 hábiles desde el acceso del 23/09 → 07/10 (${n1?.fechaNotificacion} → ${String(n1?.fechaLimite ?? "").slice(0, 10)})`);
    v.ok((n1?.documentos ?? []).some((d) => /contrato/i.test(d)) && (n1?.documentos ?? []).some((d) => /vida laboral/i.test(d)), `documentos pedidos leídos (${(n1?.documentos ?? []).length})`);
    v.ok(n1?.estado === "PENDIENTE" && !n1?.expedienteId, "pendiente y SIN vincular hasta el clic");

    // 2) La campana la enseña mientras está pendiente.
    const al1 = await api("/api/alertas", { method: "GET" });
    v.ok((al1.d.alertas ?? []).some((a) => a.id === `dehu-${n1?.id}`), "campana: aparece en DEHú");

    // 3) El mismo PDF dentro de un ZIP, con una factura: uno duplicado, otro a «Ignoradas».
    const factura = await pdfDe([["**FACTURA Nº ZZE2E-2026-001", "Proveedor: Papelería ZZE2E, S.L. · NIF B00000000", "Concepto: material de oficina", "Base 100,00 € · IVA 21 % 21,00 € · Total 121,00 €"]]);
    const iz = await importar(zipStore([{ nombre: "DEHU/notificacion-zze2e.pdf", datos: requerimiento }, { nombre: "DEHU/factura-zze2e.pdf", datos: factura }]), "descarga-dehu-zze2e.zip", "application/zip");
    v.ok(iz.status === 200 && iz.d.zip && iz.d.entradas?.length === 2, `ZIP abierto: 2 archivos (${iz.status} ${iz.d.error ?? iz.d.entradas?.length ?? ""})`);
    const resultados = [];
    for (const e of iz.d.entradas ?? []) {
      const r = await api("/api/dehu/importar", { body: e });
      if (r.d.fila?.id) notifIds.add(r.d.fila.id);
      resultados.push(r.d.estado);
    }
    v.ok(resultados.includes("duplicada"), `el mismo PDF no se duplica (${resultados.join(", ")})`);
    const ignorada = [...notifIds].length > 1 ? (await admin.from("NotificacionDehu").select("id, estado").in("id", [...notifIds]).eq("estado", "IGNORADA")).data?.[0] : null;
    v.ok(resultados.includes("no_es_notificacion") && ignorada, "la factura queda en «Ignoradas»");
    if (ignorada) {
      const del = await api(`/api/dehu/${ignorada.id}`, { method: "DELETE" });
      const { data: sigue } = await admin.from("NotificacionDehu").select("id").eq("id", ignorada.id).maybeSingle();
      v.ok(del.status === 200 && !sigue, `eliminar la ignorada (${del.status})`);
      if (!sigue) notifIds.delete(ignorada.id);
    }
    const { data: entrada } = await admin.storage.from("dehu-entrada").list(ws, { limit: 100 });
    v.ok((entrada ?? []).length === 0, `carpeta de entrada vacía (${(entrada ?? []).length} restos)`);

    // 4) Vincular (con el clic): rastro en el expediente.
    const pv = await api(`/api/dehu/${n1?.id}`, { method: "PATCH", body: { accion: "vincular", expedienteId: expId, guardarNumero: true } });
    v.ok(pv.status === 200 && pv.d.notificacion?.estado === "VINCULADA" && pv.d.notificacion?.expedienteId === expId, `vincular → VINCULADA (${pv.status} ${pv.d.error ?? ""})`);
    const { data: ev } = await admin.from("ExpedienteEvento").select("descripcion").eq("expedienteId", expId).ilike("descripcion", "%DEHú · Requerimiento%");
    v.ok((ev ?? []).length === 1, "historial del expediente: «📬 DEHú · Requerimiento …»");
    const ficha = await fetch(`${BASE}/app/expedientes/${expId}`, { headers: { cookie } });
    const html = ficha.ok ? await ficha.text() : "";
    v.ok(html.includes("Notificaciones DEHú"), `la ficha lista la notificación (${ficha.status})`);

    // 5) Registrar el requerimiento con lo leído y cerrarla.
    const rq = await api(`/api/expedientes/${expId}/requerimientos`, { body: { asunto: n1?.asunto ?? "Requerimiento", fechaLimite: "2026-10-07", recibidoEl: "2026-09-23", docs: n1?.documentos ?? [] } });
    const pg = await api(`/api/dehu/${n1?.id}`, { method: "PATCH", body: { accion: "gestionada", requerimientoId: rq.d.requerimiento?.id } });
    v.ok(rq.status === 200 && pg.status === 200 && pg.d.notificacion?.estado === "GESTIONADA" && pg.d.notificacion?.requerimientoId === rq.d.requerimiento?.id, `requerimiento registrado y notificación gestionada (${rq.status}/${pg.status} ${pg.d.error ?? rq.d.error ?? ""})`);
    const al2 = await api("/api/alertas", { method: "GET" });
    v.ok(!(al2.d.alertas ?? []).some((a) => a.id === `dehu-${n1?.id}`), "campana: desaparece de DEHú (queda la del requerimiento si vence pronto)");

    // 6) El PDF se ve; la pestaña carga.
    const pdf = await fetch(`${BASE}/api/dehu/${n1?.id}/archivo`, { headers: { cookie } });
    v.ok(pdf.status === 200 && /application\/pdf/.test(pdf.headers.get("content-type") ?? ""), `ver el PDF (${pdf.status})`);
    const pag = await fetch(`${BASE}/app/dehu`, { headers: { cookie } });
    v.ok(pag.status === 200 && (await pag.text()).includes("Notificaciones de la DEHú"), `pestaña DEHú (${pag.status})`);
  } catch (e) {
    v.ok(false, `excepción: ${e.message}`);
  } finally {
    const { data: filas } = notifIds.size ? await admin.from("NotificacionDehu").select("id, storagePath").in("id", [...notifIds]) : { data: [] };
    const rutas = (filas ?? []).map((f) => f.storagePath).filter(Boolean);
    if (rutas.length) await admin.storage.from("documentos").remove(rutas);
    if (notifIds.size) await admin.from("NotificacionDehu").delete().in("id", [...notifIds]);
    if (expId) { await admin.from("Requerimiento").delete().eq("expedienteId", expId); await admin.from("ExpedienteEvento").delete().eq("expedienteId", expId); }
    const { data: restos } = await admin.storage.from("dehu-entrada").list(ws, { limit: 100 });
    if ((restos ?? []).length) await admin.storage.from("dehu-entrada").remove(restos.map((o) => `${ws}/${o.name}`));
    await fx.limpiar();
  }
  return v.resumen();
}
