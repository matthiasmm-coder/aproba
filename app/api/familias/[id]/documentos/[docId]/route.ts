import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// GET → descarga un documento compartido de la familia (bucket privado → service_role).
// Autorización: la lectura de DocumentoFamilia va bajo sesión (RLS) → 404 si no es del workspace.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: doc } = await supabase.from("DocumentoFamilia").select("storagePath, nombreArchivo, mimeType, tipo").eq("id", docId).eq("familiaId", id).maybeSingle();
  if (!doc?.storagePath) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(doc.storagePath as string);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  const ext = (doc.storagePath as string).split(".").pop() ?? "bin";
  const nombre = (doc.nombreArchivo as string) || `${doc.tipo}.${ext}`;
  return new Response(Buffer.from(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": (doc.mimeType as string) || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${limpiar(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}

// DELETE → elimina un documento compartido (metadato + archivo del storage).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: doc } = await supabase.from("DocumentoFamilia").select("storagePath").eq("id", docId).eq("familiaId", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  if (doc.storagePath) await admin.storage.from("documentos").remove([doc.storagePath as string]).catch(() => {});
  const { error } = await admin.from("DocumentoFamilia").delete().eq("id", docId).eq("familiaId", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
