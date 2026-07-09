import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { procesarSubidaDocumento } from "@/lib/documentos-upload";

// El GESTOR sube un documento a un expediente desde su ficha (MODO INTERNO: el cliente ya
// tiene la documentación por email/WhatsApp; no hace falta enviarle el enlace). Sesión + el
// expediente se resuelve BAJO RLS (anti-IDOR). Reutiliza el pipeline común (lib/documentos-upload)
// con origen "gestor" → sin avisos al cliente. Si el expediente sigue en BORRADOR, la subida lo arranca.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const label = String(form?.get("label") ?? "").trim();
  const clienteId = String(form?.get("clienteId") ?? "").trim() || null; // familiar: doc de un miembro
  const file = form?.get("file");
  if (!label || !(file instanceof File)) return NextResponse.json({ error: "label y file requeridos" }, { status: 400 });
  const ext = TIPOS_OK[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG, WebP o PDF)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB" }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia al workspace bajo RLS (anti-IDOR): un id ajeno simplemente no existe.
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId, clienteId, tipo, estado, familiaId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  // Familiar: el clienteId debe pertenecer a la familia del expediente.
  if (clienteId) {
    if (!exp.familiaId) return NextResponse.json({ error: "Este expediente no es familiar." }, { status: 400 });
    const { data: m } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
    if (!m) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const baseUrl = baseUrlFromRequest(req);
  try {
    const r = await procesarSubidaDocumento(admin, {
      exp: { id: exp.id as string, workspaceId: exp.workspaceId as string, clienteId: exp.clienteId as string | null, tipo: exp.tipo as string, estado: exp.estado as string, familiaId: exp.familiaId as string | null },
      label, clienteId, file, buffer, ext, baseUrl, origen: "gestor",
    });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al procesar el documento" }, { status: 502 });
  }
}
