import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { labelADocTipo, DOC_A_TIPO_IA, DOC_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";
import { sembrarVencimiento, fechaCaducidadISO } from "@/lib/vencimientos";

// Upload d'un document depuis le portail client (/j/[token]) :
// fichier → Supabase Storage (bucket privé `documentos`) → Documento (PROCESANDO)
// → Claude Vision (extraction + qualité) → VALIDADO/RECHAZADO + Extraction
// → événements dans l'historial → progression de l'expediente si tout est validé.

// Upload + Vision peut dépasser le timeout Vercel par défaut (10 s) → le client
// verrait « Algo ha fallado » alors que l'extraction tournait encore.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  const label = String(form?.get("label") ?? "").trim();
  const clienteId = String(form?.get("clienteId") ?? "").trim() || null; // expediente familiar: doc de un miembro
  const file = form?.get("file");
  if (!token || !label || !(file instanceof File)) {
    return NextResponse.json({ error: "token, label y file requeridos" }, { status: 400 });
  }
  const ext = TIPOS_OK[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG, WebP o PDF)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB" }, { status: 400 });

  const admin = createSupabaseAdmin();

  // Expediente authentifié par le token du portail.
  const { data: exp, error: e1 } = await admin
    .from("Expediente")
    .select("id, workspaceId, clienteId, tipo, estado, referencia, familiaId")
    .eq("portalToken", token)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  // Documento por MIEMBRO (expediente familiar): el clienteId debe pertenecer a la familia.
  if (clienteId) {
    if (!exp.familiaId) return NextResponse.json({ error: "Este expediente no es familiar." }, { status: 400 });
    const { data: m } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
    if (!m) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
  }

  const docTipo = labelADocTipo(label);

  // Documento : réutiliser la ligne du même type (par miembro) si elle existe (re-subida), sinon créer.
  // Individual/común (clienteId null): dedup por (expediente, tipo) — sin referenciar la
  // columna clienteId, así el flujo individual funciona aunque falte la migración. Por miembro:
  // se acota además por clienteId (requiere la columna, ya migrada para el flujo familiar).
  const dq = admin.from("Documento").select("id").eq("expedienteId", exp.id).eq("tipo", docTipo);
  const { data: existente } = await (clienteId ? dq.eq("clienteId", clienteId) : dq).limit(1).maybeSingle();
  const docId = existente?.id ?? uuid();

  // Stockage (bucket privé) — chemin par expediente, horodaté.
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${exp.id}/${docTipo.toLowerCase()}-${Date.now()}.${ext}`;
  const { error: e2 } = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (e2) return NextResponse.json({ error: `Storage: ${e2.message}` }, { status: 500 });

  const base = {
    expedienteId: exp.id,
    ...(clienteId ? { clienteId } : {}), // omitido si null → default DB (compat sin migración)
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
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id, tipo: "DOC_SUBIDO",
    descripcion: `El cliente subió: ${label}`,
  });

  const baseUrl = baseUrlFromRequest(req);
  const docLabel = DOC_LABEL[docTipo] ?? label;
  await dispararAviso(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, clave: "doc_recibido", vars: { documento: docLabel }, baseUrl });

  // ── Documentos FIRMADOS (hoja de encargo / mandato): SIN validación IA ─────
  // No hay datos que extraer: el gestor comprueba la firma visualmente en la
  // ficha (y puede eliminar el documento si no vale). Validado directo.
  if (docTipo === "HOJA_ENCARGO" || docTipo === "MANDATO") {
    const { error: eFirma } = await admin.from("Documento").update({ estado: "VALIDADO" }).eq("id", docId);
    if (eFirma) return NextResponse.json({ error: eFirma.message }, { status: 500 });
    await admin.from("ExpedienteEvento").insert({
      id: uuid(), expedienteId: exp.id, tipo: "DOC_VALIDADO",
      descripcion: `Documento firmado recibido: ${docLabel}`,
    });
    await dispararAviso(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, clave: "doc_validado", vars: { documento: docLabel }, baseUrl });
    return NextResponse.json({ ok: true, estado: "VALIDADO", campos: {}, alertas: [] });
  }

  // ── Validation IA (Claude Vision) ──────────────────────────────────────────
  let resultado;
  try {
    resultado = await extraerDocumento(buffer, file.type);
  } catch (err) {
    // L'IA n'a pas pu tourner : on rend le slot re-soumissible et on remonte l'erreur.
    await admin.from("Documento").update({ estado: "PENDIENTE" }).eq("id", docId);
    const msg = err instanceof Error ? err.message : "Error de validación IA";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Cohérence : le document détecté correspond-il au document demandé ?
  const esperado = DOC_A_TIPO_IA[docTipo];
  const alertas = [...resultado.alertas];
  if (esperado && !["otro", "desconocido", esperado].includes(resultado.tipoDetectado)) {
    alertas.unshift(`El documento parece ser «${resultado.tipoDetectado.replace(/_/g, " ")}», no «${label}». Comprueba que has subido el archivo correcto.`);
    resultado.estado = "RECHAZADO";
  }

  const { error: e4 } = await admin.from("Documento").update({ estado: resultado.estado }).eq("id", docId);
  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });

  await admin.from("Extraction").upsert({
    id: uuid(),
    documentoId: docId,
    tipoDetectado: resultado.tipoDetectado,
    confianzaGlobal: resultado.confianzaGlobal,
    legibilidad: resultado.legibilidad,
    datos: resultado.campos,
    alertas,
    modelo: resultado.modelo,
    inputTokens: resultado.inputTokens,
    outputTokens: resultado.outputTokens,
  }, { onConflict: "documentoId" });

  const pct = Math.round(resultado.confianzaGlobal * 100);
  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id,
    tipo: resultado.estado === "VALIDADO" ? "DOC_VALIDADO" : "DOC_RECHAZADO",
    descripcion: resultado.estado === "VALIDADO"
      ? `IA validó: ${docLabel} (${pct} %)`
      : `IA rechazó: ${docLabel} — ${alertas[0] ?? "ilegible"}`,
  });

  // ── VIGÍA: TIE validado → persistir su caducidad en el Cliente + sembrar el vencimiento.
  // (Hoy esa fecha se extraía y se tiraba.) Dueño del doc: el miembro (familiar) o el titular.
  if (resultado.estado === "VALIDADO" && resultado.tipoDetectado === "tarjeta_residencia_tie") {
    const fechaISO = fechaCaducidadISO(resultado.fechaCaducidad);
    const duenoId = clienteId || (exp.clienteId as string | null);
    if (fechaISO && duenoId) {
      // Se persiste la fecha VALIDADA (AAAA-MM-DD del parse), nunca el texto bruto de la IA.
      const { error: eCad } = await admin
        .from("Cliente")
        .update({ fechaCaducidad: fechaISO.slice(0, 10), tipoVencimiento: "TIE" })
        .eq("id", duenoId);
      if (eCad && !/column|does not exist|schema cache/i.test(eCad.message)) console.error("[vigia caducidad]", eCad.message);
      await sembrarVencimiento(admin, { workspaceId: exp.workspaceId, clienteId: duenoId, fecha: fechaISO, tipo: "TIE", expedienteId: exp.id });
    }
  }

  await dispararAviso(admin, {
    workspaceId: exp.workspaceId, expedienteId: exp.id,
    clave: resultado.estado === "VALIDADO" ? "doc_validado" : "doc_rechazado",
    vars: { documento: docLabel }, baseUrl,
  });

  // ── Progression : tous les documents requis validés ? ─────────────────────
  // (Expediente familiar: se omite — el conteo "todos validados" depende de docs comunes +
  // docs por miembro × nº de miembros; el gestor lo revisa. El cliente cierra vía /completar.)
  if (!exp.familiaId && resultado.estado === "VALIDADO" && exp.estado === "DOCS_PENDIENTES") {
    try {
      const servicios = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
      const servicio = servicios.find((s) => s.id === TIPO_A_SERVICIO[exp.tipo]);
      const requeridos = servicio?.docs.length ?? 0;
      const { data: todosRaw } = await admin.from("Documento").select("estado, tipo").eq("expedienteId", exp.id);
      // Los documentos FIRMADOS (hoja de encargo / mandato) no cuentan para la
      // promoción: los requeridos del servicio son documentos DEL TRÁMITE.
      const todos = (todosRaw ?? []).filter((d) => d.tipo !== "HOJA_ENCARGO" && d.tipo !== "MANDATO");
      const total = todos.length;
      const validados = todos.filter((d) => d.estado === "VALIDADO").length;
      // Service identifié (tipo standard) → tous les documents requis validés.
      // Service inconnu (tipo OTRO / service custom sans équivalent dans l'enum) → on se
      // base sur les documents RÉELLEMENT soumis : promotion quand tous sont validés.
      const listo = requeridos > 0 ? validados >= requeridos : total > 0 && validados === total;
      if (listo) {
        await admin.from("Expediente").update({ estado: "DOCS_VALIDADOS", updatedAt: new Date().toISOString() }).eq("id", exp.id);
        await admin.from("ExpedienteEvento").insert({
          id: uuid(), expedienteId: exp.id, tipo: "ESTADO_CAMBIADO",
          descripcion: `IA validó ${validados}/${requeridos || total} documentos — expediente listo para formularios`,
        });
      }
    } catch {
      /* la progression n'est pas bloquante */
    }
  }

  return NextResponse.json({
    ok: true,
    estado: resultado.estado,
    campos: resultado.campos,
    alertas,
    confianza: resultado.confianzaGlobal,
  });
}

// Suppression d'un document soumis par erreur, depuis le portail (token).
// Retire le fichier du Storage + la ligne Documento (+ son Extraction) + journalise.
export async function DELETE(req: Request) {
  const { token, label, clienteId } = (await req.json().catch(() => ({}))) as { token?: string; label?: string; clienteId?: string };
  if (!token || !label) return NextResponse.json({ error: "token y label requeridos" }, { status: 400 });
  const cId = (clienteId ?? "").trim() || null;

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("id, estado").eq("portalToken", token).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const docTipo = labelADocTipo(label);
  const dq = admin.from("Documento").select("id, storagePath").eq("expedienteId", exp.id).eq("tipo", docTipo);
  const { data: doc } = await (cId ? dq.eq("clienteId", cId) : dq).limit(1).maybeSingle();
  if (!doc) return NextResponse.json({ ok: true }); // rien à supprimer

  if (doc.storagePath) await admin.storage.from("documentos").remove([doc.storagePath]);
  await admin.from("Extraction").delete().eq("documentoId", doc.id);
  const { error: eDel } = await admin.from("Documento").delete().eq("id", doc.id);
  if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO",
    descripcion: `El cliente eliminó un documento: ${label}`,
  });

  // Un document requis a été retiré → l'expediente n'est plus « validé ».
  if (exp.estado === "DOCS_VALIDADOS") {
    await admin.from("Expediente").update({ estado: "DOCS_PENDIENTES", updatedAt: new Date().toISOString() }).eq("id", exp.id);
  }

  return NextResponse.json({ ok: true });
}
