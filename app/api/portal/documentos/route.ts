import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { labelADocTipo, DOC_A_TIPO_IA, DOC_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";

// Upload d'un document depuis le portail client (/j/[token]) :
// fichier → Supabase Storage (bucket privé `documentos`) → Documento (PROCESANDO)
// → Claude Vision (extraction + qualité) → VALIDADO/RECHAZADO + Extraction
// → événements dans l'historial → progression de l'expediente si tout est validé.

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  const label = String(form?.get("label") ?? "").trim();
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
    .select("id, workspaceId, tipo, estado, referencia")
    .eq("portalToken", token)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const docTipo = labelADocTipo(label);

  // Documento : réutiliser la ligne du même type si elle existe (re-subida), sinon créer.
  const { data: existente } = await admin
    .from("Documento")
    .select("id")
    .eq("expedienteId", exp.id)
    .eq("tipo", docTipo)
    .limit(1)
    .maybeSingle();
  const docId = existente?.id ?? uuid();

  // Stockage (bucket privé) — chemin par expediente, horodaté.
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${exp.id}/${docTipo.toLowerCase()}-${Date.now()}.${ext}`;
  const { error: e2 } = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (e2) return NextResponse.json({ error: `Storage: ${e2.message}` }, { status: 500 });

  const base = {
    expedienteId: exp.id,
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

  await dispararAviso(admin, {
    workspaceId: exp.workspaceId, expedienteId: exp.id,
    clave: resultado.estado === "VALIDADO" ? "doc_validado" : "doc_rechazado",
    vars: { documento: docLabel }, baseUrl,
  });

  // ── Progression : tous les documents requis validés ? ─────────────────────
  if (resultado.estado === "VALIDADO" && exp.estado === "DOCS_PENDIENTES") {
    try {
      const servicios = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
      const servicio = servicios.find((s) => s.id === TIPO_A_SERVICIO[exp.tipo]);
      const requeridos = servicio?.docs.length ?? 0;
      const { count } = await admin
        .from("Documento")
        .select("id", { count: "exact", head: true })
        .eq("expedienteId", exp.id)
        .eq("estado", "VALIDADO");
      if (requeridos > 0 && (count ?? 0) >= requeridos) {
        await admin.from("Expediente").update({ estado: "DOCS_VALIDADOS", updatedAt: new Date().toISOString() }).eq("id", exp.id);
        await admin.from("ExpedienteEvento").insert({
          id: uuid(), expedienteId: exp.id, tipo: "ESTADO_CAMBIADO",
          descripcion: `IA validó ${count}/${requeridos} documentos — expediente listo para formularios`,
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
