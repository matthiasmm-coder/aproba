import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFacturasRecibidas } from "@/lib/data/facturas-recibidas";
import { csvFacturasRecibidas, filtrarPeriodo, nombreEnZip } from "@/lib/facturas-recibidas";
import { crearZip, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → .zip con los archivos originales de las facturas
// recibidas del periodo (las sin fecha van siempre) + facturas-recibidas.csv con los datos.
// El archivo contable de un clic, para quien lleve la contabilidad.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const url = new URL(req.url);
  const iso = (s: string | null, repli: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : repli);
  const desde = iso(url.searchParams.get("desde"), "0000-01-01"), hasta = iso(url.searchParams.get("hasta"), "9999-12-31");
  const todas = await fetchFacturasRecibidas();
  const items = filtrarPeriodo(todas, desde, hasta);
  if (!items.length) return NextResponse.json({ error: "No hay facturas recibidas en este periodo." }, { status: 404 });

  const { data: exps } = await supabase.from("Expediente").select("id, referencia").in("id", [...new Set(items.map((f) => f.expedienteId).filter((x): x is string => !!x))]);
  const ref = new Map(((exps ?? []) as { id: string; referencia: string }[]).map((e) => [e.id, e.referencia]));
  const entries: ZipEntry[] = [{ name: "facturas-recibidas.csv", data: new TextEncoder().encode(csvFacturasRecibidas(items, (id) => ref.get(id) ?? id)) }];
  const admin = createSupabaseAdmin();
  const { data: rutas } = await supabase.from("FacturaRecibida").select("id, archivoPath").in("id", items.map((f) => f.id));
  const pathDe = new Map(((rutas ?? []) as { id: string; archivoPath: string }[]).map((r) => [r.id, r.archivoPath]));
  const fallidas: string[] = [];
  for (const f of items) {
    const p = pathDe.get(f.id);
    if (!p) continue; // importada de una hoja de cálculo: sus datos van en el CSV, no hay archivo
    const dl = await admin.storage.from("documentos").download(p);
    if (dl.error || !dl.data) { fallidas.push(f.archivoNombre); continue; }
    entries.push({ name: `archivos/${nombreEnZip(f)}`, data: new Uint8Array(await dl.data.arrayBuffer()) });
  }
  if (fallidas.length) entries.push({ name: "_FALTAN_ARCHIVOS.txt", data: new TextEncoder().encode(`No se pudieron incluir estos archivos (${fallidas.length}):\n${fallidas.join("\n")}`) });
  const zip = crearZip(entries);
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="facturas-recibidas_${hoy}.zip"`, "Cache-Control": "no-store" } });
}
