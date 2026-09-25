import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchEmpresaDetalle } from "@/lib/data/empresas";
import { recogerDocumentosEmpresa } from "@/lib/data/documentos-empresa";
import { extensionDe, rutasZip } from "@/lib/documentos-empresa";
import { crearZip, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tope por descarga: una función tiene 60 s y memoria limitada. Si se pasa, el ZIP lo dice.
const MAX_ARCHIVOS = 400;
const MAX_BYTES = 250 * 1024 * 1024;

// GET → TODOS los documentos de la empresa en un ZIP (25/09/2026, Luis): «Empresa/»,
// «Hojas de encargo y mandatos/» y «Trabajadores/<nombre>/», con la fecha delante.
// La lista sale bajo sesión (RLS); los archivos, con service_role (bucket privado).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const detalle = await fetchEmpresaDetalle(id);
  if (!detalle) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const { docs } = await recogerDocumentosEmpresa(detalle);
  if (!docs.length) return NextResponse.json({ error: "Esta empresa todavía no tiene documentos." }, { status: 404 });
  const rutas = rutasZip(docs, extensionDe);
  const admin = createSupabaseAdmin();
  const entries: ZipEntry[] = [];
  const fallidos: string[] = [];
  let bytes = 0;
  let cortado = false;
  for (const d of docs) {
    const nombre = rutas.get(`${d.origen}:${d.id}`) ?? `${d.id}.${extensionDe(d.mimeType, d.nombreArchivo)}`;
    if (entries.length >= MAX_ARCHIVOS || bytes >= MAX_BYTES) { cortado = true; break; }
    const { data: blob, error } = await admin.storage.from("documentos").download(d.storagePath);
    if (error || !blob) { fallidos.push(nombre); continue; }
    const data = new Uint8Array(await blob.arrayBuffer());
    bytes += data.length;
    entries.push({ name: nombre, data });
  }
  if (fallidos.length || cortado) {
    const nota = [
      ...(cortado ? [`El ZIP se ha cortado en ${entries.length} archivos (tope de una descarga). Descarga el resto desde la ficha, documento a documento.`] : []),
      ...(fallidos.length ? [`No se pudieron incluir (${fallidos.length}):`, ...fallidos] : []),
    ].join("\n");
    entries.push({ name: "_LEEME.txt", data: new TextEncoder().encode(nota) });
  }
  const zip = crearZip(entries);
  const slug = detalle.razonSocial.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "empresa";
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documentos-${slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
