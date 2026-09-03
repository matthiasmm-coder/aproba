import "server-only";
import { Resend } from "resend";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { procesarSubidaDocumento } from "@/lib/documentos-upload";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { docsDeExpediente, serviciosDeExpediente } from "@/lib/multi-servicio";
import { clasificarDeteccion, DOC_LABEL } from "@/lib/tramites";
import { emailLayout } from "@/lib/notificaciones";
import {
  tokenDeDestinatarios, direccionDe, nombreDe, limpiarCuerpo, extraerPistas, emparejarCliente,
  extensionAdmitida, mimeDeExtension, nombreArchivoSeguro, type ClienteCandidato,
} from "@/lib/email-entrante";

// RECEPCIÓN DE DOCUMENTOS POR EMAIL — parte con red (Resend + Supabase).
// Ver lib/email-entrante.ts para las reglas puras y supabase/email-entrante.sql.

type Admin = ReturnType<typeof createSupabaseAdmin>;

export type AdjuntoBandeja = { nombre: string; mime: string; size: number; storagePath: string; destino?: "expediente" | "cliente"; docId?: string; etiqueta?: string };

const uuid = () => crypto.randomUUID();
const faltaMigracion = (msg: string) => /BandejaEntrada|emailEntranteToken|relation|column|schema cache|does not exist/i.test(msg);

// Webhook `email.received` → aquí. Idempotente por resendEmailId (Resend reintenta).
export async function procesarEmailRecibido(admin: Admin, opts: { emailId: string; baseUrl: string }): Promise<{ ok: boolean; motivo: string; filaId?: string }> {
  const { emailId, baseUrl } = opts;
  if (!process.env.RESEND_API_KEY) return { ok: false, motivo: "sin RESEND_API_KEY" };
  const resend = new Resend(process.env.RESEND_API_KEY);

  const previo = await admin.from("BandejaEntrada").select("id").eq("resendEmailId", emailId).maybeSingle();
  if (previo.error && faltaMigracion(previo.error.message)) throw new Error("Falta la migración supabase/email-entrante.sql");
  if (previo.data) return { ok: true, motivo: "duplicado", filaId: previo.data.id as string };

  const { data: mail, error } = await resend.emails.receiving.get(emailId);
  if (error || !mail) throw new Error(`Resend: ${error?.message ?? "email no encontrado"}`);
  const headers = (mail.headers ?? {}) as Record<string, string>;
  const extra = (mail as unknown as { received_for?: string[] | null }).received_for ?? null;
  const token = tokenDeDestinatarios([mail.to, mail.cc, extra, [headers["delivered-to"] ?? "", headers["x-original-to"] ?? "", headers["to"] ?? ""]]);
  if (!token) return { ok: false, motivo: "sin token de despacho en el destinatario" };

  const { data: ws } = await admin.from("Workspace").select("id, nombre").eq("emailEntranteToken", token).maybeSingle();
  if (!ws) return { ok: false, motivo: "token desconocido" };

  // Miembros del despacho: sus emails no son pistas de cliente (es quien reenvía).
  const { data: miembros } = await admin.from("Membership").select("role, user:User(email)").eq("workspaceId", ws.id);
  const emailsMiembros = new Set<string>();
  let emailOwner: string | null = null;
  for (const m of miembros ?? []) {
    const u = (Array.isArray(m.user) ? m.user[0] : m.user) as { email?: string } | null;
    const e = u?.email?.toLowerCase(); if (!e) continue;
    emailsMiembros.add(e);
    if ((m.role as string) === "OWNER" && !emailOwner) emailOwner = e;
  }
  const remitente = direccionDe(mail.from);
  const esMiembro = emailsMiembros.has(remitente);

  // Adjuntos admitidos → bucket privado bajo bandeja/<ws>/<email>/.
  const lista = await resend.emails.receiving.attachments.list({ emailId });
  const adjuntos: AdjuntoBandeja[] = [];
  let i = 0;
  for (const a of lista.data?.data ?? []) {
    const ext = extensionAdmitida({ filename: a.filename ?? null, content_type: a.content_type, size: a.size, content_disposition: a.content_disposition ?? null, content_id: a.content_id ?? null });
    if (!ext) continue;
    const res = await fetch(a.download_url).catch(() => null);
    if (!res || !res.ok) continue;
    const buffer = Buffer.from(await res.arrayBuffer());
    const nombre = nombreArchivoSeguro(a.filename, ext, i);
    const storagePath = `bandeja/${ws.id}/${emailId}/${i}-${nombre}`;
    const mime = mimeDeExtension(ext);
    const up = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: mime, upsert: true });
    if (up.error) { console.error("[email entrante] storage:", up.error.message); continue; }
    adjuntos.push({ nombre, mime, size: buffer.length, storagePath });
    i++;
  }

  const cuerpo = limpiarCuerpo(mail.text, mail.html);
  const { data: cli } = await admin.from("Cliente").select("id, nombre, apellidos, email, telefono, numeroDocumento").eq("workspaceId", ws.id);
  const clientes = (cli ?? []) as ClienteCandidato[];
  const texto = `${esMiembro ? "" : mail.from}\n${mail.subject ?? ""}\n${cuerpo}\n${adjuntos.map((a) => a.nombre).join("\n")}`;
  const pistas = extraerPistas(texto, emailsMiembros);
  const emp = emparejarCliente(clientes, pistas);

  const filaId = uuid();
  const fila = {
    id: filaId, workspaceId: ws.id, resendEmailId: emailId, remitente, remitenteNombre: nombreDe(mail.from),
    asunto: (mail.subject ?? "").slice(0, 300), texto: cuerpo.slice(0, 5000), recibidoAt: mail.created_at,
    adjuntos, clienteId: emp.cliente?.id ?? null, estado: "PENDIENTE", motivo: emp.motivo,
  };
  const ins = await admin.from("BandejaEntrada").insert(fila);
  if (ins.error) throw new Error(faltaMigracion(ins.error.message) ? "Falta la migración supabase/email-entrante.sql" : ins.error.message);

  let resultado: Awaited<ReturnType<typeof asignarBandeja>> | null = null;
  if (emp.cliente) {
    try {
      resultado = await asignarBandeja(admin, { filaId, clienteId: emp.cliente.id, expedienteId: null, baseUrl, motivo: emp.motivo });
    } catch (err) {
      console.error("[email entrante] asignación automática fallida:", err instanceof Error ? err.message : err);
      await admin.from("BandejaEntrada").update({ clienteId: emp.cliente.id, motivo: `${emp.motivo} · asignación pendiente: ${err instanceof Error ? err.message : "error"}` }).eq("id", filaId);
    }
  }

  // Aviso al despacho: siempre que quede algo por decidir, y cuando escribe el propio
  // cliente (el gestor no lo ha visto). Si el gestor reenvió y todo cayó en su sitio, silencio.
  const pendiente = !resultado;
  if (emailOwner && (pendiente || !esMiembro)) {
    await avisarDespacho(resend, { para: emailOwner, gestoria: ws.nombre as string, baseUrl, remitente, asunto: mail.subject ?? "", nAdjuntos: adjuntos.length, pendiente, cliente: emp.cliente ? `${emp.cliente.nombre} ${emp.cliente.apellidos ?? ""}`.trim() : null, referencia: resultado?.referencia ?? null });
  }
  return { ok: true, motivo: resultado ? `asignado (${emp.motivo})` : emp.motivo, filaId };
}

// Asigna una fila de la bandeja a un cliente (y, si procede, a uno de sus expedientes
// vivos): los adjuntos pasan a ser documentos reales. Lo llama la recepción automática
// y el botón «Asignar» de la bandeja.
export async function asignarBandeja(admin: Admin, opts: { filaId: string; clienteId: string; expedienteId: string | null; baseUrl: string; motivo?: string }): Promise<{ destino: "expediente" | "cliente"; referencia: string | null; documentos: number; etiquetas: string[] }> {
  const { filaId, clienteId, baseUrl } = opts;
  const { data: fila, error } = await admin.from("BandejaEntrada").select("id, workspaceId, adjuntos, remitente, asunto, estado").eq("id", filaId).maybeSingle();
  if (error || !fila) throw new Error("Email no encontrado en la bandeja.");
  const { data: cliente } = await admin.from("Cliente").select("id, workspaceId, familiaId").eq("id", clienteId).eq("workspaceId", fila.workspaceId).maybeSingle();
  if (!cliente) throw new Error("Cliente no encontrado.");

  // Expedientes vivos del cliente: uno solo → los documentos caen en sus casillas.
  let expQ = await admin.from("Expediente").select("id, workspaceId, oficinaId, clienteId, tipo, estado, familiaId, servicioClave, serviciosExtra, docsExtra, archivadoAt, referencia").eq("clienteId", clienteId).eq("workspaceId", fila.workspaceId);
  if (expQ.error) expQ = await admin.from("Expediente").select("id, workspaceId, oficinaId, clienteId, tipo, estado, familiaId, servicioClave, serviciosExtra, referencia").eq("clienteId", clienteId).eq("workspaceId", fila.workspaceId) as typeof expQ;
  type ExpRow = { id: string; workspaceId: string; oficinaId: string | null; clienteId: string | null; tipo: string; estado: string; familiaId: string | null; servicioClave: string | null; serviciosExtra: string[] | null; docsExtra?: unknown; archivadoAt?: string | null; referencia: string };
  const vivos = ((expQ.data ?? []) as ExpRow[]).filter((e) => !e.archivadoAt);
  let exp: ExpRow | null = null;
  if (opts.expedienteId) {
    exp = vivos.find((e) => e.id === opts.expedienteId) ?? null;
    if (!exp) throw new Error("Ese expediente no es de este cliente o está archivado.");
  } else if (vivos.length === 1) exp = vivos[0];

  let docsRequeridos: string[] = [];
  if (exp) {
    try {
      const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null);
      docsRequeridos = docsDeExpediente(serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipo }, catalogo), exp.docsExtra);
    } catch { /* sin catálogo → labels genéricos */ }
  }

  const adjuntos = (fila.adjuntos ?? []) as AdjuntoBandeja[];
  const etiquetas: string[] = [];
  for (const a of adjuntos) {
    if (a.docId) { etiquetas.push(a.etiqueta ?? a.nombre); continue; } // ya colocado (reintento)
    const dl = await admin.storage.from("documentos").download(a.storagePath);
    if (dl.error || !dl.data) { console.error("[bandeja] adjunto no descargable:", a.storagePath); continue; }
    const buffer = Buffer.from(await dl.data.arrayBuffer());
    const ext = a.nombre.split(".").pop() ?? "pdf";
    const file = new File([buffer], a.nombre, { type: a.mime });
    let colocado = false;
    if (exp) {
      try {
        const r = await procesarSubidaDocumento(admin, {
          exp: { id: exp.id, workspaceId: exp.workspaceId, clienteId: exp.clienteId, tipo: exp.tipo, estado: exp.estado, familiaId: exp.familiaId, oficinaId: exp.oficinaId },
          label: "", clienteId: null, file, buffer, ext, baseUrl, origen: "gestor", auto: true, docsRequeridos,
        });
        a.destino = "expediente"; a.docId = "expediente"; a.etiqueta = r.label ?? a.nombre; etiquetas.push(a.etiqueta);
        colocado = true;
      } catch (err) {
        console.error("[bandeja] subida al expediente fallida, cae en la ficha:", err instanceof Error ? err.message : err);
      }
    }
    if (!colocado) {
      // Documento suelto en la ficha del cliente, con el tipo que reconozca la IA (o «Otro documento»).
      let tipo = DOC_LABEL.OTRO;
      try { const det = await extraerDocumento(buffer, a.mime); tipo = clasificarDeteccion(det.tipoDetectado, []).label; } catch { /* sin IA: Otro documento */ }
      const docId = uuid();
      const storagePath = `clientes/${clienteId}/${docId}.${ext}`;
      const up = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: a.mime, upsert: false });
      if (up.error) throw new Error(`Storage: ${up.error.message}`);
      const ins = await admin.from("DocumentoCliente").insert({ id: docId, clienteId, workspaceId: fila.workspaceId, tipo, nombreArchivo: a.nombre, storagePath, mimeType: a.mime, sizeBytes: buffer.length });
      if (ins.error) throw new Error(ins.error.message);
      a.destino = "cliente"; a.docId = docId; a.etiqueta = tipo; etiquetas.push(tipo);
    }
  }

  if (exp) {
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: `📥 Email de ${fila.remitente}${fila.asunto ? ` · «${String(fila.asunto).slice(0, 80)}»` : ""} · ${adjuntos.length} adjunto(s) colocado(s) desde la bandeja` });
  }
  await admin.from("BandejaEntrada").update({ estado: "ASIGNADO", clienteId, expedienteId: exp?.id ?? null, adjuntos, motivo: opts.motivo ?? "manual", updatedAt: new Date().toISOString() }).eq("id", filaId);
  return { destino: exp ? "expediente" : "cliente", referencia: exp?.referencia ?? null, documentos: etiquetas.length, etiquetas };
}

export async function descartarBandeja(admin: Admin, filaId: string): Promise<void> {
  const { data: fila } = await admin.from("BandejaEntrada").select("id, adjuntos, estado").eq("id", filaId).maybeSingle();
  if (!fila) throw new Error("Email no encontrado en la bandeja.");
  const rutas = ((fila.adjuntos ?? []) as AdjuntoBandeja[]).filter((a) => !a.docId).map((a) => a.storagePath);
  if (rutas.length) await admin.storage.from("documentos").remove(rutas).catch(() => {});
  await admin.from("BandejaEntrada").update({ estado: "DESCARTADO", updatedAt: new Date().toISOString() }).eq("id", filaId);
}

async function avisarDespacho(resend: Resend, o: { para: string; gestoria: string; baseUrl: string; remitente: string; asunto: string; nAdjuntos: number; pendiente: boolean; cliente: string | null; referencia: string | null }) {
  // Mismo remitente que los avisos (lib/notificaciones.ts): el nombre del despacho + la dirección de la plataforma.
  const from = `"${o.gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const titulo = o.pendiente ? "Documentos recibidos por email, pendientes de asignar" : `Documentos de ${o.cliente} recibidos por email`;
  const detalle = o.pendiente
    ? `<p>Ha llegado un email de <b>${escapar(o.remitente)}</b>${o.asunto ? ` («${escapar(o.asunto)}»)` : ""} con ${o.nAdjuntos} adjunto(s) y no hemos podido saber de qué cliente es. Asígnalo desde la bandeja.</p>`
    : `<p>${escapar(o.cliente ?? "")} ha enviado ${o.nAdjuntos} documento(s) por email${o.referencia ? `, guardados en el expediente <b>${escapar(o.referencia)}</b>` : ", guardados en su ficha"}.</p>`;
  const html = emailLayout({ gestoria: o.gestoria, titulo, cuerpoHtml: detalle, cta: { url: `${o.baseUrl}/app/bandeja`, label: o.pendiente ? "Asignar en la bandeja" : "Ver la bandeja" } });
  const { error } = await resend.emails.send({ from, to: o.para, subject: titulo, html, text: `${titulo}. ${o.baseUrl}/app/bandeja` });
  if (error) console.error("[email entrante] aviso al despacho:", error.message);
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}
