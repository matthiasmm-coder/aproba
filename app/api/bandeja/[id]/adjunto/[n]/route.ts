import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdjuntoBandeja } from "@/lib/email-entrante-procesar";

export const runtime = "nodejs";

// GET → ver/descargar el adjunto n de un email de la bandeja (sesión + RLS, bucket privado).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: fila } = await supabase.from("BandejaEntrada").select("adjuntos").eq("id", id).maybeSingle();
  const adjunto = ((fila?.adjuntos ?? []) as AdjuntoBandeja[])[Number(n)];
  if (!adjunto?.storagePath) return NextResponse.json({ error: "Adjunto no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(adjunto.storagePath);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": adjunto.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(adjunto.nombre)}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
