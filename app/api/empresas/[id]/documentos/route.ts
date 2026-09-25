import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVOS = 10;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();
const FALTA_TABLA = /DocumentoEmpresa|DocumentoCliente|relation|schema cache|does not exist/i;

// POST (multipart: file × N, tipo, destino) → documentos de la FICHA DE EMPRESA (25/09/2026,
// Luis): los de la propia empresa (destino «empresa»: CIF, escrituras, poderes, lo que se
// presentó antes de Aproba) o los de uno de sus trabajadores (destino = id del trabajador:
// van a su ficha, como si se subieran desde ella).
// Autorización: empresa y trabajador se validan BAJO SESIÓN (RLS) antes de tocar nada con
// service_role; el workspace sale de la fila validada, nunca de la entrada.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const tipo = String(form?.get("tipo") ?? "").trim().slice(0, 120);
  const destino = String(form?.get("destino") ?? "empresa").trim();
  const archivos = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File).slice(0, MAX_ARCHIVOS);
  if (!tipo || !archivos.length) return NextResponse.json({ error: "Falta el tipo o el archivo." }, { status: 400 });

  const { data: emp } = await supabase.from("Empresa").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!emp) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  let trabajadorId: string | null = null;
  if (destino !== "empresa") {
    const { data: cli } = await supabase.from("Cliente").select("id, empresaId").eq("id", destino).maybeSingle();
    if (!cli || (cli as { empresaId?: string | null }).empresaId !== id) return NextResponse.json({ error: "Ese trabajador no es de esta empresa." }, { status: 404 });
    trabajadorId = destino;
  }

  const admin = createSupabaseAdmin();
  let subidos = 0;
  const errores: string[] = [];
  for (const file of archivos) {
    const ext = TIPOS_OK[file.type];
    if (!ext) { errores.push(`${file.name}: formato no soportado (JPG, PNG, WebP o PDF).`); continue; }
    if (file.size > MAX_BYTES) { errores.push(`${file.name}: supera los 8 MB.`); continue; }
    const docId = uuid();
    const storagePath = trabajadorId ? `clientes/${trabajadorId}/${docId}.${ext}` : `empresas/${id}/${docId}.${ext}`;
    const { error: eUp } = await admin.storage.from("documentos").upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (eUp) { errores.push(`${file.name}: ${eUp.message}`); continue; }
    const fila = { id: docId, workspaceId: emp.workspaceId, tipo, nombreArchivo: file.name, storagePath, mimeType: file.type, sizeBytes: file.size };
    const { error: eIns } = trabajadorId
      ? await admin.from("DocumentoCliente").insert({ ...fila, clienteId: trabajadorId })
      : await admin.from("DocumentoEmpresa").insert({ ...fila, empresaId: id });
    if (eIns) {
      await admin.storage.from("documentos").remove([storagePath]).catch(() => {});
      if (FALTA_TABLA.test(eIns.message)) {
        return NextResponse.json({ error: trabajadorId ? "Falta la migración: ejecuta supabase/documento-cliente-suelto.sql." : "Falta la migración: ejecuta supabase/documento-empresa.sql.", subidos }, { status: 409 });
      }
      errores.push(`${file.name}: ${eIns.message}`);
      continue;
    }
    subidos++;
  }
  return NextResponse.json({ ok: subidos > 0, subidos, errores }, { status: subidos > 0 || !errores.length ? 200 : 400 });
}
