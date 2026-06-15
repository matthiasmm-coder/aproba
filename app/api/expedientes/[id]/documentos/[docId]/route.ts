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
