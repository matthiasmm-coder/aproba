import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET → ver/descargar el archivo de una factura recibida (sesión + RLS, bucket privado).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: fila } = await supabase.from("FacturaRecibida").select("archivoPath, archivoNombre, archivoMime").eq("id", id).maybeSingle();
  if (!fila?.archivoPath) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(fila.archivoPath as string);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": (fila.archivoMime as string) || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fila.archivoNombre as string)}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
