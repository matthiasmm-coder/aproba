import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// GET → el titular descarga un documento compartido desde el portal familiar. El token de
// la familia es la credencial; se verifica que el documento pertenece a la familia del token.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const admin = createSupabaseAdmin();
  const { data: fam } = await admin.from("Familia").select("id").eq("portalToken", token).maybeSingle();
  if (!fam) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  const { data: doc } = await admin.from("DocumentoFamilia").select("storagePath, nombreArchivo, mimeType, tipo").eq("id", docId).eq("familiaId", fam.id).maybeSingle();
  if (!doc?.storagePath) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

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
