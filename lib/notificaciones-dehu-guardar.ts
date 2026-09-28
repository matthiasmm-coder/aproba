import "server-only";
import { createHash, randomUUID as uuid } from "node:crypto";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { leerPaginado } from "@/lib/supabase/paginar";
import { extraerNotificacion, type LecturaNotificacion } from "@/lib/extraction-notificacion";
import {
  COLS_NOTIFICACION, avisoQueCierra, fechaLimiteSugerida, limiteParaAbrir, mapFilaNotificacion, sugerirExpediente,
  type AvisoLeido, type AvisoPendiente, type ExpedienteCandidato, type NotificacionDehu, type PersonaCandidata,
} from "@/lib/notificaciones-dehu";

// NOTIFICACIONES DE LA DEHú — parte con red (Storage + IA + Supabase). Lo usan la
// importación de la pestaña DEHú (app/api/dehu/importar), los PDF reenviados a la
// dirección de Aproba y los avisos de la DEHú que llegan a esa misma dirección
// (lib/email-entrante-procesar.ts). Ver lib/notificaciones-dehu.ts para las reglas.

type Admin = ReturnType<typeof createSupabaseAdmin>;
export const ERROR_MIGRACION_DEHU = "Falta la migración: ejecuta supabase/notificaciones-dehu.sql.";
// Bucket privado de paso para lo que se sube en la pestaña DEHú (ZIP incluidos); el PDF
// leído queda en «documentos» (notificaciones/<despacho>/<id>.pdf).
export const BUCKET_ENTRADA = "dehu-entrada";
export const faltaMigracionDehu = (msg: string) => /NotificacionDehu|relation|schema cache|does not exist|PGRST205/i.test(msg);
const faltaColumna = (msg: string) => /column|schema cache/i.test(msg);

export const huellaDe = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
export const extensionDe = (mime: string) => (mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
export const nombreArchivoSeguro = (nombre: string) =>
  (nombre || "notificacion").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "notificacion";

// ── Candidatos: cada expediente del despacho con TODAS sus personas ─────────
// Titular, miembros de su familia y trabajadores (expediente de empresa), con NIE y
// pasaporte; más el NIF de la empresa. Lectura con el admin (la importación y el email
// no tienen sesión de sede): la propuesta solo se ENSEÑA bajo RLS.
export async function candidatosDeWorkspace(admin: Admin, workspaceId: string): Promise<ExpedienteCandidato[]> {
  const leerExp = (cols: string) => leerPaginado<Record<string, unknown>>((d, h) => admin.from("Expediente").select(cols).eq("workspaceId", workspaceId).order("id").range(d, h));
  let exps = await leerExp("id, referencia, numeroOficial, archivadoAt, createdAt, clienteId, familiaId, empresaId");
  if (exps.error && faltaColumna(exps.error.message)) exps = await leerExp("id, referencia, archivadoAt, createdAt, clienteId");
  const filas = exps.data as unknown as { id: string; referencia: string; numeroOficial?: string | null; archivadoAt: string | null; createdAt: string; clienteId: string | null; familiaId?: string | null; empresaId?: string | null }[];
  if (!filas.length) return [];

  const leerCli = (cols: string) => leerPaginado<Record<string, unknown>>((d, h) => admin.from("Cliente").select(cols).eq("workspaceId", workspaceId).order("id").range(d, h));
  let cli = await leerCli("id, nombre, apellidos, numeroDocumento, pasaporte, familiaId");
  if (cli.error && faltaColumna(cli.error.message)) cli = await leerCli("id, nombre, apellidos, numeroDocumento");
  const clientes = new Map<string, PersonaCandidata & { familiaId: string | null }>();
  for (const c of cli.data as unknown as { id: string; nombre: string | null; apellidos: string | null; numeroDocumento: string | null; pasaporte?: string | null; familiaId?: string | null }[]) {
    clientes.set(c.id, { clienteId: c.id, nombre: `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim(), nie: c.numeroDocumento ?? null, pasaporte: c.pasaporte ?? null, familiaId: c.familiaId ?? null });
  }
  const porFamilia = new Map<string, string[]>();
  for (const c of clientes.values()) if (c.familiaId) porFamilia.set(c.familiaId, [...(porFamilia.get(c.familiaId) ?? []), c.clienteId]);

  const trabajadores = new Map<string, string[]>();
  const tr = await leerPaginado<{ expedienteId: string; clienteId: string }>((d, h) => admin.from("ExpedienteTrabajador").select("expedienteId, clienteId").eq("workspaceId", workspaceId).order("id").range(d, h));
  for (const t of tr.error ? [] : tr.data) trabajadores.set(t.expedienteId, [...(trabajadores.get(t.expedienteId) ?? []), t.clienteId]);
  const nifEmpresa = new Map<string, string>();
  const em = await leerPaginado<{ id: string; nif: string | null }>((d, h) => admin.from("Empresa").select("id, nif").eq("workspaceId", workspaceId).order("id").range(d, h), 5);
  for (const e of em.error ? [] : em.data) if (e.nif) nifEmpresa.set(e.id, e.nif);

  return filas.map((e) => {
    const ids = [e.clienteId, ...(e.familiaId ? porFamilia.get(e.familiaId) ?? [] : []), ...(trabajadores.get(e.id) ?? [])].filter((x): x is string => Boolean(x));
    const personas = [...new Set(ids)].map((id) => clientes.get(id)).filter((p): p is PersonaCandidata & { familiaId: string | null } => Boolean(p))
      .map(({ clienteId, nombre, nie, pasaporte }) => ({ clienteId, nombre, nie, pasaporte }));
    return {
      id: e.id, referencia: e.referencia, numeroOficial: e.numeroOficial ?? null, vivo: !e.archivadoAt, creadoAt: e.createdAt,
      personas, empresaNif: e.empresaId ? nifEmpresa.get(e.empresaId) ?? null : null,
    };
  });
}

async function leerFila(admin: Admin, id: string): Promise<NotificacionDehu | null> {
  const { data } = await admin.from("NotificacionDehu").select(COLS_NOTIFICACION).eq("id", id).maybeSingle();
  return data ? mapFilaNotificacion(data as Record<string, unknown>) : null;
}

// Avisos pendientes que un PDF recién importado puede dejar resueltos.
async function cerrarAvisoDe(admin: Admin, workspaceId: string, notifId: string, n: LecturaNotificacion): Promise<string | null> {
  const { data } = await admin.from("NotificacionDehu").select("id, organismo, fechaPuestaDisposicion, numeroExpediente, nie, aviso, createdAt")
    .eq("workspaceId", workspaceId).eq("origen", "AVISO_EMAIL").eq("tipo", "AVISO").eq("estado", "PENDIENTE").limit(300);
  const avisos: (AvisoPendiente & { aviso: Record<string, unknown> })[] = ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id), organismo: (a.organismo as string | null) ?? null, fechaPuestaDisposicion: typeof a.fechaPuestaDisposicion === "string" ? a.fechaPuestaDisposicion.slice(0, 10) : null,
    identificador: typeof (a.aviso as Record<string, unknown> | null)?.identificador === "string" ? String((a.aviso as Record<string, unknown>).identificador) : null,
    numeroExpediente: (a.numeroExpediente as string | null) ?? null, nie: (a.nie as string | null) ?? null, createdAt: String(a.createdAt),
    aviso: ((a.aviso ?? {}) as Record<string, unknown>),
  }));
  const id = avisoQueCierra(n, avisos);
  if (!id) return null;
  const previo = avisos.find((a) => a.id === id)?.aviso ?? {};
  const ahora = new Date().toISOString();
  await admin.from("NotificacionDehu").update({ estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: "Aproba (PDF importado)", aviso: { ...previo, cerradaPor: notifId }, updatedAt: ahora }).eq("id", id);
  return id;
}

export type ResultadoImportacion =
  | { estado: "importada"; fila: NotificacionDehu; avisoCerrado: string | null }
  | { estado: "duplicada"; fila: NotificacionDehu | null }
  | { estado: "no_es_notificacion"; fila: NotificacionDehu | null };

// Un archivo (PDF o foto) → lectura IA → fila PENDIENTE con su expediente PROPUESTO.
// `storagePath`: el archivo ya está en el bucket (subida directa o adjunto de un email).
// `siNoEs`: lo que la IA no reconoce como notificación — «ignorar» lo guarda en
// «Ignoradas» (importación manual: el gestor puede recuperarlo); «descartar» no guarda
// nada (email: el adjunto sigue su circuito de documentos de cliente).
export async function importarNotificacion(admin: Admin, o: {
  workspaceId: string; buffer: Buffer; mime: string; nombre: string; storagePath?: string | null;
  creadoPorId?: string | null; siNoEs: "ignorar" | "descartar";
}): Promise<ResultadoImportacion> {
  const huella = huellaDe(o.buffer);
  const previo = await admin.from("NotificacionDehu").select("id").eq("workspaceId", o.workspaceId).eq("huella", huella).maybeSingle();
  if (previo.error) throw new Error(faltaMigracionDehu(previo.error.message) ? ERROR_MIGRACION_DEHU : previo.error.message);
  if (previo.data) return { estado: "duplicada", fila: await leerFila(admin, previo.data.id as string) };

  const leida = await extraerNotificacion(o.buffer, o.mime); // IaNoDisponible sube: se reintenta
  if (!leida.esNotificacion && o.siNoEs === "descartar") return { estado: "no_es_notificacion", fila: null };

  // El mismo acto con otro envoltorio (suelto y dentro de un ZIP): mismo CSV o identificador.
  for (const [clave, valor] of [["csv", leida.csv], ["identificador", leida.identificador]] as const) {
    if (!valor || !leida.esNotificacion) continue;
    const { data: gemela } = await admin.from("NotificacionDehu").select("id, fechaNotificacion, estado, tipo").eq("workspaceId", o.workspaceId).eq(`iaDatos->>${clave}`, valor).limit(1).maybeSingle();
    if (!gemela) continue;
    // Si esta copia trae la fecha de acceso que a la otra le faltaba, se completa (y su plazo).
    if (!gemela.fechaNotificacion && leida.fechaNotificacion && gemela.estado !== "GESTIONADA") {
      const limite = fechaLimiteSugerida({ ...leida, tipo: (gemela.tipo as LecturaNotificacion["tipo"]) ?? leida.tipo });
      await admin.from("NotificacionDehu").update({
        fechaNotificacion: leida.fechaNotificacion, fechaPuestaDisposicion: leida.fechaPuestaDisposicion,
        ...(limite ? { fechaLimite: limite.toISOString() } : {}), updatedAt: new Date().toISOString(),
      }).eq("id", gemela.id);
    }
    return { estado: "duplicada", fila: await leerFila(admin, gemela.id as string) };
  }

  const id = uuid();
  const nombreArchivo = nombreArchivoSeguro(o.nombre);
  let storagePath = o.storagePath ?? null;
  if (!storagePath) {
    storagePath = `notificaciones/${o.workspaceId}/${id}.${extensionDe(o.mime)}`;
    const up = await admin.storage.from("documentos").upload(storagePath, o.buffer, { contentType: o.mime, upsert: true });
    if (up.error) throw new Error(`No se pudo guardar el archivo: ${up.error.message}`);
  }

  const esNotif = leida.esNotificacion;
  const sugerencia = esNotif ? sugerirExpediente(leida, await candidatosDeWorkspace(admin, o.workspaceId)) : null;
  const limite = esNotif ? fechaLimiteSugerida(leida) : null;
  const { inputTokens, outputTokens, ...datos } = leida;
  const fila = {
    id, workspaceId: o.workspaceId, origen: "PDF", estado: esNotif ? "PENDIENTE" : "IGNORADA", tipo: esNotif ? leida.tipo : "OTRA",
    organismo: leida.organismo, asunto: leida.asunto, resumen: leida.resumen,
    titularNombre: leida.titularNombre, nie: leida.nie, pasaporte: leida.pasaporte, numeroExpediente: leida.numeroExpediente,
    fechaActo: leida.fechaActo, fechaNotificacion: leida.fechaNotificacion, fechaPuestaDisposicion: leida.fechaPuestaDisposicion,
    plazo: leida.plazo, plazoTipo: leida.plazoTipo, fechaLimite: limite ? limite.toISOString() : null,
    documentos: leida.documentos, tasas: leida.tasas.length ? leida.tasas : null,
    storagePath, nombreArchivo, sizeBytes: o.buffer.length, huella,
    expedienteSugeridoId: sugerencia?.expedienteId ?? null, motivoSugerencia: sugerencia?.motivo ?? null,
    iaDatos: { ...datos, plazoDesdeHoy: Boolean(limite && !leida.fechaNotificacion), noEsNotificacion: !esNotif, sugerencia, tokens: { entrada: inputTokens, salida: outputTokens } },
    confianza: leida.confianza, creadoPorId: o.creadoPorId ?? null,
    ...(esNotif ? {} : { gestionadaPor: "Aproba (no parece una notificación)", gestionadaAt: new Date().toISOString() }),
    updatedAt: new Date().toISOString(),
  };
  const ins = await admin.from("NotificacionDehu").insert(fila);
  if (ins.error) {
    if (/duplicate key|unique/i.test(ins.error.message)) {
      // Carrera: el mismo archivo entró a la vez por otra vía.
      if (!o.storagePath) await admin.storage.from("documentos").remove([storagePath]).catch(() => {});
      const { data: otra } = await admin.from("NotificacionDehu").select("id").eq("workspaceId", o.workspaceId).eq("huella", huella).maybeSingle();
      return { estado: "duplicada", fila: otra ? await leerFila(admin, otra.id as string) : null };
    }
    if (!o.storagePath) await admin.storage.from("documentos").remove([storagePath]).catch(() => {});
    throw new Error(faltaMigracionDehu(ins.error.message) ? ERROR_MIGRACION_DEHU : ins.error.message);
  }
  const creada = await leerFila(admin, id);
  if (!esNotif) return { estado: "no_es_notificacion", fila: creada };
  const avisoCerrado = await cerrarAvisoDe(admin, o.workspaceId, id, leida).catch(() => null);
  return { estado: "importada", fila: creada ?? mapFilaNotificacion(fila), avisoCerrado };
}

// ── Avisos por email ─────────────────────────────────────────────────────────
// Un aviso de la DEHú (o la verificación de la dirección) → fila PENDIENTE con los 10
// días naturales para abrirla. Idempotente por email (Resend reintenta el webhook).
export async function guardarAvisoDehu(admin: Admin, o: {
  workspaceId: string; emailId: string; remitente: string; asuntoEmail: string; recibidoAt: string | null; leido: AvisoLeido;
}): Promise<{ fila: NotificacionDehu | null; duplicado: boolean }> {
  const { leido } = o;
  const recibido = o.recibidoAt ? new Date(o.recibidoAt) : new Date();
  const puesta = leido.fechaPuestaDisposicion ? new Date(`${leido.fechaPuestaDisposicion}T12:00:00Z`) : recibido;
  const limite = leido.fechaLimite ? new Date(`${leido.fechaLimite}T21:59:00Z`) : limiteParaAbrir(puesta);
  // Solo por datos fuertes (nº de expediente o NIE): el titular de un aviso suele ser el
  // propio despacho, y un nombre parecido no basta para proponer nada.
  const sugerencia = leido.esAviso && (leido.numeroExpediente || leido.nie)
    ? sugerirExpediente({ numeroExpediente: leido.numeroExpediente, nie: leido.nie, pasaporte: null, titularNombre: null }, await candidatosDeWorkspace(admin, o.workspaceId))
    : null;
  const id = uuid();
  const fila = {
    id, workspaceId: o.workspaceId, origen: "AVISO_EMAIL", estado: "PENDIENTE", tipo: leido.esVerificacion && !leido.esAviso ? "VERIFICACION" : "AVISO",
    organismo: leido.organismo, asunto: (leido.concepto ?? o.asuntoEmail).slice(0, 200) || null, titularNombre: leido.titularNombre,
    nie: leido.nie, numeroExpediente: leido.numeroExpediente,
    fechaPuestaDisposicion: puesta.toISOString().slice(0, 10), fechaLimite: leido.esAviso ? limite.toISOString() : null,
    huella: `email:${o.emailId}`,
    expedienteSugeridoId: sugerencia?.expedienteId ?? null, motivoSugerencia: sugerencia?.motivo ?? null,
    aviso: { remitente: o.remitente, asuntoEmail: o.asuntoEmail.slice(0, 300), recibidoAt: recibido.toISOString(), identificador: leido.identificador, codigo: leido.codigo },
    iaDatos: { sugerencia },
    updatedAt: new Date().toISOString(),
  };
  const ins = await admin.from("NotificacionDehu").insert(fila);
  if (ins.error) {
    if (/duplicate key|unique/i.test(ins.error.message)) return { fila: null, duplicado: true };
    throw new Error(faltaMigracionDehu(ins.error.message) ? ERROR_MIGRACION_DEHU : ins.error.message);
  }
  return { fila: await leerFila(admin, id), duplicado: false };
}
