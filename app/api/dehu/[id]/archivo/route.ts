import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET → ver el PDF (o la foto) de una notificación de la DEHú (sesión + RLS, bucket privado).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: fila } = await supabase.from("NotificacionDehu").select("storagePath, nombreArchivo").eq("id", id).maybeSingle();
  if (!fila?.storagePath) return NextResponse.json({ error: "Notificación no encontrada." }, { status: 404 });
  const { data: blob, error } = await createSupabaseAdmin().storage.from("documentos").download(fila.storagePath as string);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  const ext = /\.([a-z]+)$/.exec(fila.storagePath as string)?.[1] ?? "pdf";
  const tipo = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `inline; filename="${encodeURIComponent(String(fila.nombreArchivo ?? `notificacion.${ext}`))}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
