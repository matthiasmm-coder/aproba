import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";


// GET → el cliente descarga la tasa 790-012 que el gestor generó y guardó.
// El portalToken ES la credencial; el archivo se sirve desde el bucket privado.
// Expediente FAMILIAR: ?clienteId=<miembro> → su tasa nominativa (ruta determinista),
// validando que el miembro pertenece a la familia del expediente (anti-IDOR).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token no válido." }, { status: 400 });
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";

  const admin = createSupabaseAdmin();
  // select de tasaPath defensivo: si la columna no existe (migración pendiente) → 404.
  const { data, error } = await admin.from("Expediente").select("id, estado, tasaPath, familiaId").eq("portalToken", token).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const exp = data as { id: string; estado: string; tasaPath: string | null; familiaId: string | null };
  // Sin puerta de ESTADO. La resolución de más abajo ya es 100 % factual (si el
  // formulario/la tasa no existe, devuelve 404), y la puerta anterior contradecía al
  // propio portal: /s enseña los botones en cuanto el fichero existe, y esta ruta los
  // rechazaba con un 403 mientras el estado no hubiera avanzado — 29 expedientes
  // estaban exactamente en ese caso. Además tasaPath NUNCA se escribe en el flujo
  // familiar (la tasa del miembro vive en el storage), así que una puerta sobre él
  // habría roto la descarga de TODAS las familias.

  // Candidatas en orden de prioridad: la 790-012 (tasaPath / nominativa) y, si no
  // existe, la 790-026 (nacionalidad — nunca escribe tasaPath, vive por ruta
  // determinista). Se sirve la primera que exista en el bucket.
  let candidatas: string[];
  if (clienteId && exp.familiaId) {
    const { data: m } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
    if (!m) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    candidatas = [`${exp.id}/tasa-790-012-${clienteId}.pdf`, `${exp.id}/tasa-790-026-${clienteId}.pdf`];
  } else {
    candidatas = [...(exp.tasaPath ? [exp.tasaPath] : []), `${exp.id}/tasa-790-026.pdf`];
  }

  let blob: Blob | null = null;
  let nombre = "";
  for (const path of candidatas) {
    const { data, error: e2 } = await admin.storage.from("documentos").download(path);
    if (!e2 && data) { blob = data; nombre = path.split("/").pop() ?? "tasa-790.pdf"; break; }
  }
  if (!blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
