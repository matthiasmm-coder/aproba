import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { labelADocTipo, clasificarDeteccion, DOC_A_TIPO_IA, DOC_LABEL } from "@/lib/tramites";
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
// subida NO cambia el estado: que el trámite esté vivo se deriva de que haya documentos.
export async function procesarSubidaDocumento(admin: Admin, opts: {
  exp: ExpParaSubida; label: string; clienteId: string | null; file: File; buffer: Buffer; ext: string; baseUrl: string; origen: "cliente" | "gestor";
  // CLASIFICACIÓN AUTOMÁTICA: con auto=true el label de entrada se ignora — la IA
  // detecta el tipo (UNA sola pasada de Vision, la misma que valida) y el documento
  // cae en su casilla. soloRequeridos (portal): un tipo fuera de la lista del servicio
  // NO se guarda — se devuelve NO_RECONOCIDO y el cliente usa su casilla manual.
  auto?: boolean; docsRequeridos?: string[]; soloRequeridos?: boolean;
}): Promise<Resultado & { tipo?: string; label?: string; requerido?: boolean }> {
  const { exp, clienteId, file, buffer, ext, baseUrl, origen } = opts;
  const uuid = () => crypto.randomUUID();
  const notificar = origen === "cliente"; // en modo interno el cliente no recibe avisos

  // ── Modo AUTO: detectar ANTES de persistir (así un NO_RECONOCIDO no deja rastro) ──
  let resultadoPrevio: Awaited<ReturnType<typeof extraerDocumento>> | null = null;
  let label = opts.label;
  let docTipo: string;
  if (opts.auto) {
    try {
      resultadoPrevio = await extraerDocumento(buffer, file.type);
    } catch (err) {
      console.error("[upload auto] validación IA caída:", err instanceof Error ? err.message : err);
      throw new Error("La validación automática no está disponible en este momento. Vuelve a intentarlo en unos minutos.");
    }
    const cls = clasificarDeteccion(resultadoPrevio.tipoDetectado, opts.docsRequeridos ?? []);
    if (opts.soloRequeridos && !cls.requerido) {
      return { ok: true, estado: "NO_RECONOCIDO", campos: [], alertas: [], tipo: cls.docTipo, label: cls.label, requerido: false };
    }
    docTipo = cls.docTipo;
    label = cls.label;
  } else {
    docTipo = labelADocTipo(label);
  }

  // Documento: reutilizar la fila del mismo tipo (por miembro) si existe (re-subida), sinon crear.
  // La fila se reutiliza (re-subida) por CASILLA, no por tipo: dos documentos pedidos
  // a mano son los dos OTRO y el segundo pisaba el fichero del primero.
  const buscar = (conEtiqueta: boolean) => {
    let q = admin.from("Documento").select("id").eq("expedienteId", exp.id).eq("tipo", docTipo);
    if (conEtiqueta) q = q.eq("etiqueta", label);
    if (clienteId) q = q.eq("clienteId", clienteId);
    return q.limit(1).maybeSingle();
  };
  let ex = await buscar(true);
  const sinEtiqueta = Boolean(ex.error && /etiqueta|column|schema cache/i.test(ex.error.message));
  if (sinEtiqueta) ex = await buscar(false);
  const existente = ex.data;
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
  const escribir = async (fila: Record<string, unknown>) => (existente
    ? admin.from("Documento").update({ ...fila, estado: "PROCESANDO" }).eq("id", docId)
    : admin.from("Documento").insert({ id: docId, ...fila, estado: "PROCESANDO" }));
  let w = await escribir(sinEtiqueta ? base : { ...base, etiqueta: label });
  if (w.error && /etiqueta|column|schema cache/i.test(w.error.message)) w = await escribir(base);
  if (w.error) throw new Error(w.error.message);

  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id, tipo: "DOC_SUBIDO",
    descripcion: origen === "cliente" ? `El cliente subió: ${label}` : `El despacho subió: ${label}`,
  });

  // El auto-arranque VIVÍA AQUÍ: al subir el gestor un documento, promovía el expediente
  // de BORRADOR a DOCS_PENDIENTES. Se retira (22/08/2026) por las dos razones de siempre:
  // escribía un valor de enum ya muerto, y sobre todo el arranque YA NO hace falta
  // declararlo — se deriva del hecho (hay documentos ⇒ el trámite vive, ver `arrancado`
  // en lib/progreso.ts). Es el mismo motivo por el que reconciliarProgresoDocs quedó vacía.
  // El evento DOC_SUBIDO de más arriba ya deja constancia de que el despacho aportó papeles.

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
    return { ok: true, estado: "VALIDADO", campos: [], alertas: [], tipo: docTipo, label };
  }

  // ── Validación IA (Claude Vision) — en modo auto ya se hizo (una sola pasada) ──
  let resultado;
  try {
    resultado = resultadoPrevio ?? await extraerDocumento(buffer, file.type);
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

  // ¿El documento detectado corresponde al pedido? (En modo auto no aplica: la casilla
  // ES la detección — no puede contradecirse a sí misma.)
  const esperado = opts.auto ? undefined : DOC_A_TIPO_IA[docTipo];
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

  return { ok: true, estado: resultado.estado, campos: resultado.campos, alertas, confianza: resultado.confianzaGlobal, tipo: docTipo, label };
}

// ── Reconciliación de estado según los documentos requeridos: YA NO EXISTE ──
// Se conserva la firma porque /api/expedientes/[id]/servicio todavía la llama, pero el
// cuerpo está vacío a propósito. La regla que aplicaba (comparar docTipos validados
// contra los requeridos) vive ahora en docsCompletos() de lib/progreso.ts y se evalúa
// A LA LECTURA, sin escribir nada.
export async function reconciliarProgresoDocs(_admin: Admin, _expedienteId: string, _contexto: "subida" | "servicios" = "subida"): Promise<void> {
  // VACIADA a propósito (21/08/2026). Antes promovía DOCS_PENDIENTES↔DOCS_VALIDADOS tras
  // cada subida — y excluía a las familias, que por eso se quedaban atascadas para
  // siempre. Ahora esa lectura se calcula a la LECTURA en lib/progreso.ts, para todos
  // por igual y sin escribir nada: un estado que se recalcula no puede mentir.
  // Se conserva la firma porque tres rutas la llaman; se retirará cuando se limpien.
  return;
}

