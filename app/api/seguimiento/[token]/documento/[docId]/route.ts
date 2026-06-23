import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DOC_LABEL } from "@/lib/tramites";

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// GET → el cliente descarga uno de SUS documentos desde la página de seguimiento.
// El portalToken ES la credencial; además el documento debe pertenecer a ESE expediente
// (evita IDOR: con un token no se puede pedir el documento de otro expediente).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  if (!token) return NextResponse.json({ error: "Token no válido." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("id").eq("portalToken", token).maybeSingle();
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const { data: doc } = await admin
    .from("Documento")
    .select("storagePath, nombreArchivo, mimeType, tipo")
    .eq("id", docId)
    .eq("expedienteId", (exp as { id: string }).id)
    .maybeSingle();
  if (!doc?.storagePath) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

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
