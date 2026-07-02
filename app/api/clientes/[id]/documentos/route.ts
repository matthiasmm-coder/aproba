import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();

// POST → el gestor sube un documento SUELTO del cliente (sin expediente): pasaporte, TIE…
// Solo autenticado; el cliente se valida bajo sesión/RLS antes de tocar admin, y el
// workspaceId se deriva de la fila validada (nunca de la entrada).
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

  const { data: cli } = await supabase.from("Cliente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const docId = uuid();
  const storagePath = `clientes/${id}/${docId}.${ext}`;
  const { error: eUp } = await admin.storage.from("documentos").upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (eUp) return NextResponse.json({ error: `Storage: ${eUp.message}` }, { status: 500 });

  const { error: eIns } = await admin.from("DocumentoCliente").insert({
    id: docId, clienteId: id, workspaceId: cli.workspaceId, tipo,
    nombreArchivo: file.name, storagePath, mimeType: file.type, sizeBytes: file.size,
  });
  if (eIns) {
    await admin.storage.from("documentos").remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: /DocumentoCliente|relation|column|schema cache|does not exist/i.test(eIns.message) ? "Falta la migración: ejecuta supabase/documento-cliente-suelto.sql." : eIns.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: docId });
}
