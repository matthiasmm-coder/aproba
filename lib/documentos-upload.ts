import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { labelADocTipo, DOC_A_TIPO_IA, DOC_LABEL } from "@/lib/tramites";
import { docsDeServicios, serviciosDeExpediente } from "@/lib/multi-servicio";
import { sembrarVencimiento, fechaCaducidadISO, tipoVencimientoDeDocumento } from "@/lib/vencimientos";

type Admin = ReturnType<typeof createSupabaseAdmin>;

export type ExpParaSubida = {
  id: string; workspaceId: string; clienteId: string | null; tipo: string; estado: string; familiaId: string | null;
  oficinaId?: string | null; // multi-oficina: catálogo (docs por servicio) de SU sede
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
    // Caída transitoria del proveedor IA (sobrecarga 529, rate limit 429, timeout…):
    // el mensaje crudo del SDK (inglés/JSON) NO debe llegar al cliente final — misma
    // familia que el bug del 06/08 (error técnico mostrado tal cual a un migrante).
    // El documento queda PENDIENTE: el gestor lo ve y el cliente puede reintentar.
    // El error real se conserva en logs para diagnóstico.
    console.error("[upload] validación IA caída:", err instanceof Error ? err.message : err);
    throw new Error("La validación automática no está disponible en este momento. Tu documento se ha guardado — vuelve a intentarlo en unos minutos.");
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

  // ── VIGÍA: documento de identidad validado → sembrar su vencimiento ──
  // Antes solo el TIE. Los clientes suben sobre todo el pasaporte, cuya fecha la IA
  // ya leía y nadie usaba (42 fechas desperdiciadas al 18/08/2026).
  const tipoVenc = resultado.estado === "VALIDADO" ? tipoVencimientoDeDocumento(resultado.tipoDetectado) : null;
  if (tipoVenc) {
    const fechaISO = fechaCaducidadISO(resultado.fechaCaducidad);
    const duenoId = clienteId || (exp.clienteId as string | null);
    if (fechaISO && duenoId) {
      // Cliente.fechaCaducidad es el campo histórico de la ficha: sigue siendo el del
      // TIE. Machacarlo con la del pasaporte cambiaría el sentido de la columna.
      if (tipoVenc === "TIE") {
        const { error: eCad } = await admin.from("Cliente").update({ fechaCaducidad: fechaISO.slice(0, 10), tipoVencimiento: "TIE" }).eq("id", duenoId);
        if (eCad && !/column|does not exist|schema cache/i.test(eCad.message)) console.error("[vigia caducidad]", eCad.message);
      }
      await sembrarVencimiento(admin, { workspaceId: exp.workspaceId, clienteId: duenoId, fecha: fechaISO, tipo: tipoVenc, expedienteId: exp.id });
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
export async function reconciliarProgresoDocs(_admin: Admin, _expedienteId: string, _contexto: "subida" | "servicios" = "subida"): Promise<void> {
  // VACIADA a propósito (21/08/2026). Antes promovía DOCS_PENDIENTES↔DOCS_VALIDADOS tras
  // cada subida — y excluía a las familias, que por eso se quedaban atascadas para
  // siempre. Ahora esa lectura se calcula a la LECTURA en lib/progreso.ts, para todos
  // por igual y sin escribir nada: un estado que se recalcula no puede mentir.
  // Se conserva la firma porque tres rutas la llaman; se retirará cuando se limpien.
  return;
}

