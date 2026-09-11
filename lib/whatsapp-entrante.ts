import "server-only";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cuentaPorPhoneNumberId, descargarMedia, enviarTexto, marcarLeido, type CuentaWA } from "@/lib/whatsapp-meta";
import { leerWebhook, claveTelefono, telefonoE164, ADMITIDOS_WA, type MensajeWA, type CambioWA } from "@/lib/whatsapp-util";
import { asignarBandeja, type AdjuntoBandeja } from "@/lib/email-entrante-procesar";
import { crearClienteDesdeAdjuntos } from "@/lib/email-cliente-nuevo";
import { makeT, esLangSoportada, type Lang } from "@/lib/portal-i18n";

// WHATSAPP ENTRANTE — el cliente escribe al número de SU gestoría (coexistencia) y cada
// foto o PDF acaba donde toca sin que nadie lo mueva: mismo pipeline que el email
// (BandejaEntrada → asignarBandeja: Vision, casilla del expediente vivo o ficha del
// cliente, ficha rellenada, cliente nuevo desde su documento de identidad).
//
// Reglas (principio «adaptarse al gestor», 06/09/2026):
//  · identidad = el TELÉFONO: el remitente se empareja con Cliente.telefono (E.164).
//  · solo se actúa sobre MEDIA admitida (foto, PDF). Un texto suelto no se toca: la
//    conversación es del gestor, Aproba solo archiva documentos.
//  · se responde en el hilo ÚNICAMENTE a un cliente conocido y solo cuando se ha
//    guardado algo («✅ Recibido: Pasaporte · EXP-2026-0012»). Nunca a desconocidos.
//  · desconocido con documentos → fila PENDIENTE en la bandeja (el gestor asigna o crea el
//    cliente con un toque); si el documento es de identidad legible, se propone el nombre.
//  · idempotente por wamid (Meta reintenta los webhooks).
type Admin = ReturnType<typeof createSupabaseAdmin>;
const uuid = () => crypto.randomUUID();
const isoDe = (ts: string) => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString(); };
const nombreArchivo = (m: MensajeWA, ext: string) => (m.media?.nombre?.replace(/[^\w.\-() ]+/g, "_").slice(0, 100) || `${m.tipo}-${m.id.slice(-8)}.${ext}`);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function procesarWebhookWhatsApp(admin: Admin, payload: unknown, baseUrl: string): Promise<string[]> {
  const notas: string[] = [];
  for (const cambio of leerWebhook(payload)) {
    try {
      if (cambio.campo === "messages") {
        const cuenta = await cuentaPorPhoneNumberId(admin, cambio.phoneNumberId);
        if (!cuenta) { notas.push(`messages: número ${cambio.phoneNumberId} sin cuenta conectada`); continue; }
        for (const m of cambio.mensajes) notas.push(await mensajeEntrante(admin, cuenta, m, baseUrl));
        for (const s of cambio.estados) await admin.from("WhatsAppMensaje").update({ estado: s.estado, error: s.error }).eq("id", s.id).eq("direccion", "OUT");
      } else if (cambio.campo === "smb_message_echoes") {
        // Lo que el gestor escribe desde su app: se registra (ventana, contexto). No se procesa.
        const cuenta = await cuentaPorPhoneNumberId(admin, cambio.phoneNumberId);
        if (!cuenta) continue;
        for (const e of cambio.ecos) await registrar(admin, cuenta, { id: e.id, telefono: e.para, direccion: "ECO", tipo: e.tipo, texto: e.texto, media: e.media, timestamp: isoDe(e.timestamp) });
        notas.push(`ecos: ${cambio.ecos.length}`);
      } else if (cambio.campo === "history") {
        const cuenta = await cuentaPorPhoneNumberId(admin, cambio.phoneNumberId);
        if (!cuenta) continue;
        let n = 0;
        for (const h of cambio.hilos) for (const m of h.mensajes) { await registrar(admin, cuenta, { id: m.id, telefono: h.telefono, direccion: "HIST", tipo: m.tipo, texto: m.texto, media: m.media, timestamp: isoDe(m.timestamp) }); n++; }
        notas.push(`historial: ${n} mensajes (fase ${cambio.fase ?? "?"})`);
      } else if (cambio.campo === "message_template_status_update") {
        const { data: c } = await admin.from("WhatsAppCuenta").select("id, plantillas").eq("wabaId", cambio.wabaId).maybeSingle();
        if (c) await admin.from("WhatsAppCuenta").update({ plantillas: { ...((c.plantillas as Record<string, string>) ?? {}), [`${cambio.nombre}:${cambio.idioma}`]: cambio.estado }, updatedAt: new Date().toISOString() }).eq("id", c.id);
        notas.push(`plantilla ${cambio.nombre}: ${cambio.estado}${cambio.motivo ? ` (${cambio.motivo})` : ""}`);
      } else {
        notas.push(`ignorado: ${cambio.nombre}`);
      }
    } catch (e) {
      console.error("[whatsapp entrante]", e instanceof Error ? e.message : e);
      notas.push(`error: ${e instanceof Error ? e.message : "?"}`);
    }
  }
  return notas;
}

async function registrar(admin: Admin, cuenta: CuentaWA, m: { id: string; telefono: string; direccion: "IN" | "OUT" | "ECO" | "HIST"; tipo: string; texto: string | null; media: { id: string; mime: string; nombre: string | null } | null; timestamp: string; clienteId?: string | null; bandejaId?: string | null; estado?: string | null }): Promise<boolean> {
  const telefono = telefonoE164(m.telefono) ?? m.telefono;
  const { error } = await admin.from("WhatsAppMensaje").insert({
    id: m.id, workspaceId: cuenta.workspaceId, cuentaId: cuenta.id, clienteId: m.clienteId ?? null, telefono, direccion: m.direccion, tipo: m.tipo,
    texto: m.texto?.slice(0, 4000) ?? null, mediaId: m.media?.id ?? null, mediaMime: m.media?.mime ?? null, nombreArchivo: m.media?.nombre ?? null,
    estado: m.estado ?? null, bandejaId: m.bandejaId ?? null, timestamp: m.timestamp,
  });
  if (error && /duplicate|unique/i.test(error.message)) return false; // ya visto (reintento de Meta)
  if (error) throw new Error(error.message);
  return true;
}

// Cliente del despacho con ese teléfono (E.164 con y sin «+», y el histórico «6xxxxxxxx»).
async function clientePorTelefono(admin: Admin, workspaceId: string, wa: string): Promise<{ id: string; nombre: string; idioma: string | null } | null> {
  const clave = claveTelefono(wa); if (!clave) return null;
  const { data } = await admin.from("Cliente").select("id, nombre, apellidos, telefono, idioma").eq("workspaceId", workspaceId).not("telefono", "is", null);
  const c = ((data ?? []) as { id: string; nombre: string | null; apellidos: string | null; telefono: string | null; idioma: string | null }[]).find((x) => claveTelefono(x.telefono) === clave);
  return c ? { id: c.id, nombre: `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim(), idioma: c.idioma } : null;
}

async function mensajeEntrante(admin: Admin, cuenta: CuentaWA, m: MensajeWA, baseUrl: string): Promise<string> {
  const cliente = await clientePorTelefono(admin, cuenta.workspaceId, m.de);
  const media = m.media && ADMITIDOS_WA.has(m.media.mime) ? m.media : null;
  const nuevo = await registrar(admin, cuenta, { id: m.id, telefono: m.de, direccion: "IN", tipo: m.tipo, texto: m.texto ?? m.caption, media: m.media, timestamp: isoDe(m.timestamp), clienteId: cliente?.id ?? null });
  if (!nuevo) return `IN ${m.id}: duplicado`;
  if (cliente) await admin.from("Cliente").update({ updatedAt: new Date().toISOString() }).eq("id", cliente.id).then(() => {}, () => {});
  if (!media) return `IN ${m.id}: ${m.tipo} de ${cliente ? cliente.nombre : "desconocido"} (sin documento, no se toca)`;

  // Documento → bucket privado bajo bandeja/<ws>/wa-<wamid>/ y fila de la bandeja (canal whatsapp).
  const { buffer, mime, size } = await descargarMedia(cuenta, media.id);
  const ext = EXT[mime] ?? EXT[media.mime] ?? "bin";
  const nombre = nombreArchivo(m, ext);
  const carpeta = `bandeja/${cuenta.workspaceId}/wa-${m.id.replace(/[^\w]/g, "").slice(-24)}`;
  const storagePath = `${carpeta}/0-${nombre}`;
  const up = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (up.error) throw new Error(`Storage: ${up.error.message}`);
  const adjuntos: AdjuntoBandeja[] = [{ nombre, mime, size, storagePath }];
  const filaId = uuid();
  const telefono = telefonoE164(m.de) ?? m.de;
  const fila: Record<string, unknown> = {
    id: filaId, workspaceId: cuenta.workspaceId, resendEmailId: `wa:${m.id}`, remitente: telefono, remitenteNombre: cliente?.nombre ?? m.nombrePerfil ?? null,
    asunto: m.caption ?? m.texto ?? null, texto: (m.caption ?? m.texto ?? "").slice(0, 5000) || null, recibidoAt: isoDe(m.timestamp), adjuntos,
    clienteId: cliente?.id ?? null, estado: "PENDIENTE", motivo: cliente ? "teléfono" : "teléfono desconocido", canal: "whatsapp", remitenteTelefono: telefono,
  };
  let ins = await admin.from("BandejaEntrada").insert(fila);
  if (ins.error && /canal|remitenteTelefono|column|schema cache/i.test(ins.error.message)) { const { canal: _c, remitenteTelefono: _t, ...sin } = fila; void _c; void _t; ins = await admin.from("BandejaEntrada").insert(sin); }
  if (ins.error) throw new Error(ins.error.message);
  await admin.from("WhatsAppMensaje").update({ bandejaId: filaId }).eq("id", m.id);

  let clienteId = cliente?.id ?? null;
  let nombreCliente = cliente?.nombre ?? null;
  let creado = false;
  if (!clienteId) {
    // Desconocido con un documento de IDENTIDAD legible → cliente nuevo con su ficha y su
    // teléfono. Cualquier otra cosa se queda PENDIENTE para que el gestor decida.
    const n = await crearClienteDesdeAdjuntos(admin, { workspaceId: cuenta.workspaceId, adjuntos });
    if (n) {
      clienteId = n.clienteId; nombreCliente = `${n.nombre} ${n.apellidos}`.trim(); creado = n.creado;
      await admin.from("Cliente").update({ telefono, updatedAt: new Date().toISOString() }).eq("id", n.clienteId).is("telefono", null);
    }
  }
  if (!clienteId) return `IN ${m.id}: documento de desconocido (${telefono}) → bandeja PENDIENTE`;

  const r = await asignarBandeja(admin, { filaId, clienteId, expedienteId: null, baseUrl, motivo: creado ? "cliente nuevo creado desde WhatsApp" : "teléfono (WhatsApp)" });
  await admin.from("WhatsAppMensaje").update({ clienteId }).eq("id", m.id);

  // Respuesta en el hilo (dentro de la ventana de 24 h: texto libre), en el idioma del cliente.
  try {
    const { data: c } = await admin.from("Cliente").select("idioma").eq("id", clienteId).maybeSingle();
    const lang = (esLangSoportada((c as { idioma?: string | null } | null)?.idioma) ? (c as { idioma: string }).idioma : "es") as Lang;
    const t = makeT(lang);
    const docs = r.etiquetas.length ? r.etiquetas.join(", ") : nombre;
    const texto = r.destino === "expediente" && r.referencia ? t("wa.recibidoExp", { docs, referencia: r.referencia }) : t("wa.recibidoFicha", { docs });
    const env = await enviarTexto(cuenta, telefono, texto, { responderA: m.id });
    if (env.id) await registrar(admin, cuenta, { id: env.id, telefono, direccion: "OUT", tipo: "text", texto, media: null, timestamp: new Date().toISOString(), clienteId, estado: "sent" });
    await marcarLeido(cuenta, m.id);
  } catch (e) { console.error("[whatsapp respuesta]", e instanceof Error ? e.message : e); }
  return `IN ${m.id}: ${r.documentos} documento(s) de ${nombreCliente} → ${r.destino === "expediente" ? r.referencia : "ficha"}${creado ? " (cliente nuevo)" : ""}`;
}

export type { CambioWA };
