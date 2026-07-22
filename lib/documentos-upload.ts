import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { labelADocTipo, DOC_A_TIPO_IA, DOC_LABEL } from "@/lib/tramites";
import { docsDeServicios, serviciosDeExpediente } from "@/lib/multi-servicio";
import { sembrarVencimiento, fechaCaducidadISO } from "@/lib/vencimientos";

type Admin = ReturnType<typeof createSupabaseAdmin>;

export type ExpParaSubida = {
  id: string; workspaceId: string; clienteId: string | null; tipo: string; estado: string; familiaId: string | null;
};

type Resultado = { ok: true; estado: string; campos?: unknown; alertas: string[]; confianza?: number };

// Pipeline COMÚN de subida de un documento a un expediente — reutilizado por el portal
// del cliente (/api/portal/documentos, token) y por el gestor (/api/expedientes/[id]/documentos,
// sesión). fichier → Storage → Documento (PROCESANDO) → Claude Vision → VALIDADO/RECHAZADO
// + Extraction → eventos → Vigía → progresión del expediente.
//
// `origen` distingue quién sube:
//  - "cliente": eventos «El cliente subió…» + avisos al cliente (doc recibido/validado/rechazado).
//  - "gestor" (modo interno): eventos «El despacho subió…» y SIN avisos al cliente (no está en el bucle).
// Además, si el expediente sigue en BORRADOR (nadie lo ha iniciado por el portal), la primera
// subida lo arranca (BORRADOR → DOCS_PENDIENTES), para que el gestor pueda trabajarlo internamente.
export async function procesarSubidaDocumento(admin: Admin, opts: {
  exp: ExpParaSubida; label: string; clienteId: string | null; file: File; buffer: Buffer; ext: string; baseUrl: string; origen: "cliente" | "gestor";
}): Promise<Resultado> {
  const { exp, label, clienteId, file, buffer, ext, baseUrl, origen } = opts;
  const uuid = () => crypto.randomUUID();
  const notificar = origen === "cliente"; // en modo interno el cliente no recibe avisos
  const docTipo = labelADocTipo(label);
  let estadoExp = exp.estado; // puede avanzar dentro de esta subida (auto-arranque + promoción)

  // Documento: reutilizar la fila del mismo tipo (por miembro) si existe (re-subida), sinon crear.
  const dq = admin.from("Documento").select("id").eq("expedienteId", exp.id).eq("tipo", docTipo);
  const { data: existente } = await (clienteId ? dq.eq("clienteId", clienteId) : dq).limit(1).maybeSingle();
  const docId = existente?.id ?? uuid();

  // Almacenamiento (bucket privado) — ruta por expediente, con marca de tiempo.
  const storagePath = `${exp.id}/${docTipo.toLowerCase()}-${Date.now()}.${ext}`;
  const { error: e2 } = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (e2) throw new Error(`Storage: ${e2.message}`);

  const base = {
    expedienteId: exp.id,
    ...(clienteId ? { clienteId } : {}),
    tipo: docTipo,
    nombreArchivo: file.name,
    storagePath,
    mimeType: file.type,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
  };
  const { error: e3 } = existente
    ? await admin.from("Documento").update({ ...base, estado: "PROCESANDO" }).eq("id", docId)
    : await admin.from("Documento").insert({ id: docId, ...base, estado: "PROCESANDO" });
  if (e3) throw new Error(e3.message);

  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id, tipo: "DOC_SUBIDO",
    descripcion: origen === "cliente" ? `El cliente subió: ${label}` : `El despacho subió: ${label}`,
  });

  // Auto-arranque — SOLO en modo interno del gestor: si nadie ha iniciado el expediente por
  // el portal, la subida del gestor lo arranca. En el portal, el arranque sigue pasando SIEMPRE
  // por /api/portal/iniciar (paso 0); no lo tocamos aquí para no cambiar el comportamiento del
  // cliente (p. ej. una renovación de Vigía en modo reanudación sube docs en BORRADOR sin promover).
  if (origen === "gestor" && estadoExp === "BORRADOR") {
    await admin.from("Expediente").update({ estado: "DOCS_PENDIENTES", updatedAt: new Date().toISOString() }).eq("id", exp.id);
    await admin.from("ExpedienteEvento").insert({
      id: uuid(), expedienteId: exp.id, tipo: "ESTADO_CAMBIADO",
      descripcion: "El despacho inició el expediente internamente (documentación aportada por el gestor)",
    });
    estadoExp = "DOCS_PENDIENTES";
  }

  const docLabel = DOC_LABEL[docTipo] ?? label;
  if (notificar) await dispararAviso(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, clave: "doc_recibido", vars: { documento: docLabel }, baseUrl });

  // ── Documentos FIRMADOS (hoja de encargo / mandato): SIN validación IA ──
  if (docTipo === "HOJA_ENCARGO" || docTipo === "MANDATO") {
    const { error: eFirma } = await admin.from("Documento").update({ estado: "VALIDADO" }).eq("id", docId);
    if (eFirma) throw new Error(eFirma.message);
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "DOC_VALIDADO", descripcion: `Documento firmado recibido: ${docLabel}` });
    if (notificar) await dispararAviso(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, clave: "doc_validado", vars: { documento: docLabel }, baseUrl });
    // campos DEBE ser un array (el tipo lo es): un {} aquí hacía que el portal
    // ejecutara {}.slice(...) al recibir la respuesta → «slice is not a function»
    // y la página del cliente crashea al subir el encargo/mandato firmado.
    return { ok: true, estado: "VALIDADO", campos: [], alertas: [] };
  }

  // ── Validación IA (Claude Vision) ──
  let resultado;
  try {
    resultado = await extraerDocumento(buffer, file.type);
  } catch (err) {
    await admin.from("Documento").update({ estado: "PENDIENTE" }).eq("id", docId);
    throw new Error(err instanceof Error ? err.message : "Error de validación IA");
  }

  // ¿El documento detectado corresponde al pedido?
  const esperado = DOC_A_TIPO_IA[docTipo];
  const alertas = [...resultado.alertas];
  if (esperado && !["otro", "desconocido", esperado].includes(resultado.tipoDetectado)) {
    alertas.unshift(`El documento parece ser «${resultado.tipoDetectado.replace(/_/g, " ")}», no «${label}». Comprueba que has subido el archivo correcto.`);
    resultado.estado = "RECHAZADO";
  }

  const { error: e4 } = await admin.from("Documento").update({ estado: resultado.estado }).eq("id", docId);
  if (e4) throw new Error(e4.message);

  await admin.from("Extraction").upsert({
    id: uuid(), documentoId: docId,
    tipoDetectado: resultado.tipoDetectado, confianzaGlobal: resultado.confianzaGlobal, legibilidad: resultado.legibilidad,
    datos: resultado.campos, alertas, modelo: resultado.modelo, inputTokens: resultado.inputTokens, outputTokens: resultado.outputTokens,
  }, { onConflict: "documentoId" });

  const pct = Math.round(resultado.confianzaGlobal * 100);
  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id,
    tipo: resultado.estado === "VALIDADO" ? "DOC_VALIDADO" : "DOC_RECHAZADO",
    descripcion: resultado.estado === "VALIDADO" ? `IA validó: ${docLabel} (${pct} %)` : `IA rechazó: ${docLabel} — ${alertas[0] ?? "ilegible"}`,
  });

  // ── VIGÍA: TIE validado → persistir su caducidad + sembrar el vencimiento ──
  if (resultado.estado === "VALIDADO" && resultado.tipoDetectado === "tarjeta_residencia_tie") {
    const fechaISO = fechaCaducidadISO(resultado.fechaCaducidad);
    const duenoId = clienteId || (exp.clienteId as string | null);
    if (fechaISO && duenoId) {
      const { error: eCad } = await admin.from("Cliente").update({ fechaCaducidad: fechaISO.slice(0, 10), tipoVencimiento: "TIE" }).eq("id", duenoId);
      if (eCad && !/column|does not exist|schema cache/i.test(eCad.message)) console.error("[vigia caducidad]", eCad.message);
      await sembrarVencimiento(admin, { workspaceId: exp.workspaceId, clienteId: duenoId, fecha: fechaISO, tipo: "TIE", expedienteId: exp.id });
    }
  }

  if (notificar) await dispararAviso(admin, {
    workspaceId: exp.workspaceId, expedienteId: exp.id,
    clave: resultado.estado === "VALIDADO" ? "doc_validado" : "doc_rechazado", vars: { documento: docLabel }, baseUrl,
  });

  // ── Progresión / reconciliación tras cada subida (mientras se recogen documentos) ──
  if (!exp.familiaId && (estadoExp === "DOCS_PENDIENTES" || estadoExp === "DOCS_VALIDADOS")) {
    await reconciliarProgresoDocs(admin, exp.id, "subida");
  }

  return { ok: true, estado: resultado.estado, campos: resultado.campos, alertas, confianza: resultado.confianzaGlobal };
}

// ── Reconciliación de estado según los documentos requeridos ──
// Promueve a DOCS_VALIDADOS cuando TODOS los requeridos (unión de los docs del servicio
// principal + extras) están validados, y REVIERTE a DOCS_PENDIENTES si dejan de estarlo.
// Se ejecuta tras cada subida ("subida") y cuando cambian los servicios del expediente
// ("servicios" — añadir un servicio puede requerir docs nuevos y el estado no debe mentir).
// El criterio compara por docTipo VALIDADO (tolerante a dos labels que mapean el mismo
// tipo — un conteo validados>=N sería inalcanzable en ese caso). Nunca lanza.
export async function reconciliarProgresoDocs(admin: Admin, expedienteId: string, contexto: "subida" | "servicios" = "subida"): Promise<void> {
  const uuid = () => crypto.randomUUID();
  try {
    // Lectura defensiva: serviciosExtra puede no existir (migración pendiente).
    let q = await admin.from("Expediente").select("id, workspaceId, familiaId, estado, tipo, servicioClave, serviciosExtra").eq("id", expedienteId).maybeSingle();
    if (q.error) q = await admin.from("Expediente").select("id, workspaceId, familiaId, estado, tipo, servicioClave").eq("id", expedienteId).maybeSingle() as typeof q;
    const exp = q.data as { id: string; workspaceId: string; familiaId: string | null; estado: string; tipo: string; servicioClave?: string | null; serviciosExtra?: string[] | null } | null;
    if (!exp || exp.familiaId) return;
    if (exp.estado !== "DOCS_PENDIENTES" && exp.estado !== "DOCS_VALIDADOS") return;

    const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
    const requeridos = docsDeServicios(serviciosDeExpediente(exp, catalogo));
    const { data: todosRaw } = await admin.from("Documento").select("estado, tipo").eq("expedienteId", exp.id);
    const todos = (todosRaw ?? []).filter((d) => d.tipo !== "HOJA_ENCARGO" && d.tipo !== "MANDATO");
    const total = todos.length;
    const validados = todos.filter((d) => d.estado === "VALIDADO").length;
    const tiposValidados = new Set(todos.filter((d) => d.estado === "VALIDADO").map((d) => d.tipo));
    const faltanValidados = requeridos.filter((label) => !tiposValidados.has(labelADocTipo(label)));
    const listo = requeridos.length > 0 ? faltanValidados.length === 0 : total > 0 && validados === total;

    if (listo && exp.estado === "DOCS_PENDIENTES") {
      await admin.from("Expediente").update({ estado: "DOCS_VALIDADOS", updatedAt: new Date().toISOString() }).eq("id", exp.id);
      await admin.from("ExpedienteEvento").insert({
        id: uuid(), expedienteId: exp.id, tipo: "ESTADO_CAMBIADO",
        descripcion: contexto === "subida"
          ? `IA validó ${validados}/${requeridos.length || total} documentos — expediente listo para formularios`
          : "Con los servicios actualizados, todos los documentos requeridos están validados — expediente listo para formularios",
      });
    } else if (!listo && exp.estado === "DOCS_VALIDADOS") {
      await admin.from("Expediente").update({ estado: "DOCS_PENDIENTES", updatedAt: new Date().toISOString() }).eq("id", exp.id);
      await admin.from("ExpedienteEvento").insert({
        id: uuid(), expedienteId: exp.id, tipo: "ESTADO_CAMBIADO",
        descripcion: contexto === "subida"
          ? "Un documento requerido dejó de estar validado — el expediente vuelve a «documentos pendientes»"
          : "Los servicios actualizados requieren documentos nuevos — el expediente vuelve a «documentos pendientes»",
      });
    }
  } catch { /* la reconciliación no es bloqueante */ }
}
