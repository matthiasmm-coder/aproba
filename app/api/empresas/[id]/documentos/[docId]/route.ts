import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// GET → un documento de la propia EMPRESA (bucket privado → service_role). Con ?ver=1 se
// abre en el navegador; si no, se descarga. La lectura de la fila va bajo sesión (RLS):
// un documento de otro despacho «no existe».
export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: doc } = await supabase.from("DocumentoEmpresa").select("storagePath, nombreArchivo, mimeType, tipo").eq("id", docId).eq("empresaId", id).maybeSingle();
  if (!doc?.storagePath) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(doc.storagePath as string);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  const ext = (doc.storagePath as string).split(".").pop() ?? "bin";
  const nombre = (doc.nombreArchivo as string) || `${doc.tipo}.${ext}`;
  return new Response(Buffer.from(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": (doc.mimeType as string) || "application/octet-stream",
      "Content-Disposition": `${new URL(req.url).searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="${limpiar(nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}

// DELETE → quita un documento subido a la ficha de la empresa (archivo y fila).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: doc } = await supabase.from("DocumentoEmpresa").select("id, storagePath").eq("id", docId).eq("empresaId", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("DocumentoEmpresa").delete().eq("id", docId).eq("empresaId", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (doc.storagePath) await admin.storage.from("documentos").remove([doc.storagePath as string]).catch(() => {});
  return NextResponse.json({ ok: true });
}
