import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { labelADocTipo } from "@/lib/tramites";
import { procesarSubidaDocumento } from "@/lib/documentos-upload";

// Upload d'un document depuis le portail client (/j/[token]). Authentifié par le token
// du portail. Le pipeline (Storage → Vision → validation → progression) est partagé avec
// l'upload côté gestor (lib/documentos-upload.ts) — ici, origen "cliente" (avisos au client).

// Upload + Vision peut dépasser le timeout Vercel par défaut (10 s) → maxDuration relevé.
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const baseUrl = baseUrlFromRequest(req);
  try {
    const r = await procesarSubidaDocumento(admin, {
      exp: { id: exp.id as string, workspaceId: exp.workspaceId as string, clienteId: exp.clienteId as string | null, tipo: exp.tipo as string, estado: exp.estado as string, familiaId: exp.familiaId as string | null },
      label, clienteId, file, buffer, ext, baseUrl, origen: "cliente",
    });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al procesar el documento" }, { status: 502 });
  }
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
