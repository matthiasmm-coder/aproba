import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DOC_LABEL } from "@/lib/tramites";
import { crearZip, nombreSeguro, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60; // baja todos los archivos del storage

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");

// GET → TODOS los documentos que el cliente ya subió, en un único ZIP.
// portalToken = credencial; solo los Documento de SU expediente (con archivo).
// Familiar: cada archivo lleva el nombre del miembro como prefijo.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const SEL = "id, referencia, familiaId, documentos:Documento(tipo, storagePath, nombreArchivo, clienteId)";
  let res = await admin.from("Expediente").select(SEL).eq("portalToken", token).maybeSingle();
  // Repli pre-migración documento-cliente (sin clienteId en el embed).
  if (res.error) res = await admin.from("Expediente").select("id, referencia, documentos:Documento(tipo, storagePath, nombreArchivo)").eq("portalToken", token).maybeSingle() as typeof res;
  const exp = res.data as unknown as {
    id: string; referencia: string; familiaId?: string | null;
    documentos: { tipo: string; storagePath: string | null; nombreArchivo: string | null; clienteId?: string | null }[] | null;
  } | null;
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const subidos = (exp.documentos ?? []).filter((d) => d.storagePath);
  if (!subidos.length) return NextResponse.json({ error: "Aún no hay documentos subidos." }, { status: 404 });

  // Nombre de cada miembro (prefijo del archivo en un expediente familiar).
  const nombrePor = new Map<string, string>();
  if (exp.familiaId) {
    const { data: mm } = await admin.from("Cliente").select("id, nombre, apellidos").eq("familiaId", exp.familiaId);
    for (const r of (mm ?? []) as { id: string; nombre: string | null; apellidos: string | null }[]) {
      nombrePor.set(r.id, `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim());
    }
  }

  const entries: ZipEntry[] = [];
  const usados = new Set<string>();
  const add = (name: string, data: Uint8Array) => {
    let full = name;
    if (usados.has(full)) {
      const punto = full.lastIndexOf(".");
      const [base, ext] = punto > 0 ? [full.slice(0, punto), full.slice(punto)] : [full, ""];
      let i = 2; while (usados.has(`${base} (${i})${ext}`)) i++;
      full = `${base} (${i})${ext}`;
    }
    usados.add(full);
    entries.push({ name: full, data });
  };
  for (const d of subidos) {
    try {
      const { data: blob, error } = await admin.storage.from("documentos").download(d.storagePath!);
      if (error || !blob) throw new Error(error?.message ?? "archivo no disponible");
      const ext = d.storagePath!.split(".").pop() ?? "bin";
      const base = d.nombreArchivo || `${DOC_LABEL[d.tipo] ?? d.tipo}.${ext}`;
      const quien = d.clienteId ? nombrePor.get(d.clienteId) : "";
      add(nombreSeguro(quien ? `${quien} - ${base}` : base), new Uint8Array(await blob.arrayBuffer()));
    } catch (e) { console.error("[seguimiento zip] doc", d.storagePath, e instanceof Error ? e.message : e); }
  }

  if (!entries.length) return NextResponse.json({ error: "Aún no hay documentos subidos." }, { status: 404 });
  const zip = crearZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documentos_${limpiar(exp.referencia)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
