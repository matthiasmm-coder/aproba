import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DOC_LABEL } from "@/lib/tramites";

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// GET → télécharge le fichier d'un document soumis par le client.
// Autorisation : la requête Documento passe par la session (RLS) → ne renvoie que
// les documents du workspace du gestor (404 sinon). Le fichier lui-même est servi
// via le service_role car le bucket `documentos` est privé (RGPD).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: doc } = await supabase
    .from("Documento")
    .select("storagePath, nombreArchivo, mimeType, tipo")
    .eq("id", docId)
    .eq("expedienteId", id)
    .maybeSingle();
  if (!doc?.storagePath) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(doc.storagePath);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = doc.storagePath.split(".").pop() ?? "bin";
  const nombre = doc.nombreArchivo || `${DOC_LABEL[doc.tipo] ?? doc.tipo}.${ext}`;
  return new Response(buffer, {
    headers: {
      "Content-Type": doc.mimeType || blob.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${limpiar(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}

// DELETE → el gestor elimina el documento (cliente equivocado de archivo, o la IA
// lo validó pero el gestor/abogado no lo da por bueno). El hueco vuelve a
// «pendiente» en el portal y el cliente puede subirlo de nuevo desde su enlace.
// Autorización: resolución bajo RLS (sesión) ANTES de tocar nada con service_role.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // RLS: el documento y su expediente solo resuelven dentro del workspace del gestor.
  const { data: doc } = await supabase
    .from("Documento")
    .select("id, storagePath, tipo, expediente:Expediente(id, estado)")
    .eq("id", docId)
    .eq("expedienteId", id)
    .maybeSingle();
  const exp = (Array.isArray(doc?.expediente) ? doc?.expediente[0] : doc?.expediente) as { id: string; estado: string } | null | undefined;
  if (!doc || !exp) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  // Archivo del bucket privado (si lo hay), extracción IA y fila — en este orden:
  // si algo falla a mitad, nunca queda una fila sin archivo recuperable.
  if (doc.storagePath) await admin.storage.from("documentos").remove([doc.storagePath]);
  await admin.from("Extraction").delete().eq("documentoId", docId);
  const { error: eDel } = await admin.from("Documento").delete().eq("id", docId);
  if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });

  // Si el expediente ya estaba en DOCS_VALIDADOS, vuelve a DOCS_PENDIENTES:
  // con un documento menos, la afirmación «todo validado» dejaría de ser cierta.
  if (exp.estado === "DOCS_VALIDADOS") {
    await admin.from("Expediente").update({ estado: "DOCS_PENDIENTES", updatedAt: new Date().toISOString() }).eq("id", exp.id);
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: exp.id,
    tipo: "COMENTARIO",
    descripcion: `🗑 Documento «${DOC_LABEL[doc.tipo] ?? doc.tipo}» eliminado por el gestor · el cliente puede volver a subirlo desde su enlace`,
  });

  return NextResponse.json({ ok: true, estado: exp.estado === "DOCS_VALIDADOS" ? "DOCS_PENDIENTES" : exp.estado });
}
