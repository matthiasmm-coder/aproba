import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();

// POST → sube un documento COMPARTIDO a la familia (bucket privado). Solo el gestor
// autenticado, validando que la familia es de su workspace (RLS de la lectura de Familia).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const tipo = String(form?.get("tipo") ?? "").trim();
  const file = form?.get("file");
  if (!tipo || !(file instanceof File)) return NextResponse.json({ error: "Falta el tipo o el archivo." }, { status: 400 });
  const ext = TIPOS_OK[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG, WebP o PDF)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB." }, { status: 400 });

  const { data: fam } = await supabase.from("Familia").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const docId = uuid();
  const storagePath = `familias/${id}/${docId}.${ext}`;
  const { error: eUp } = await admin.storage.from("documentos").upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (eUp) return NextResponse.json({ error: `Storage: ${eUp.message}` }, { status: 500 });

  const { error: eIns } = await admin.from("DocumentoFamilia").insert({
    id: docId, familiaId: id, workspaceId: fam.workspaceId, tipo,
    nombreArchivo: file.name, storagePath, mimeType: file.type, sizeBytes: file.size,
  });
  if (eIns) {
    await admin.storage.from("documentos").remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: /DocumentoFamilia|relation|column|schema cache|does not exist/i.test(eIns.message) ? "Falta la migración: ejecuta supabase/familia-documentos.sql." : eIns.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: docId });
}
