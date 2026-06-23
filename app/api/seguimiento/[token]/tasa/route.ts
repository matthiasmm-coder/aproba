import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ORDEN: Record<string, number> = {
  BORRADOR: 0, DOCS_PENDIENTES: 1, DOCS_VALIDADOS: 2, FORM_GENERADO: 3,
  PRESENTADO: 4, RESUELTO: 5, CITA_HUELLAS: 6, FINALIZADO: 7, RECHAZADO: 4,
};

// GET → el cliente descarga la tasa 790-012 que el gestor generó y guardó.
// El portalToken ES la credencial; el archivo se sirve desde el bucket privado.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token no válido." }, { status: 400 });

  const admin = createSupabaseAdmin();
  // select de tasaPath defensivo: si la columna no existe (migración pendiente) → 404.
  const { data, error } = await admin.from("Expediente").select("estado, tasaPath").eq("portalToken", token).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const exp = data as { estado: string; tasaPath: string | null };

  if ((ORDEN[exp.estado] ?? 0) < ORDEN.FORM_GENERADO) {
    return NextResponse.json({ error: "Aún no disponible." }, { status: 403 });
  }
  if (!exp.tasaPath) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const { data: blob, error: e2 } = await admin.storage.from("documentos").download(exp.tasaPath);
  if (e2 || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="tasa-790-012.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
