import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchFacturas } from "@/lib/data/facturas";
import { completarClienteDatosFacturas } from "@/lib/factura-datos-backfill";
import { fetchDespacho } from "@/lib/data/config";
import { facturaToPdf } from "@/lib/export-pdf";
import { crearZip, nombreSeguro, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60; // regenera un PDF por factura: puede tardar con muchas facturas

// GET → .zip con el PDF de TODAS las facturas emitidas y pagadas (no borradores, no
// archivadas) del despacho. Un solo clic para el archivo contable. Autorización por
// sesión/RLS: fetchFacturas pasa por createSupabaseServer, así que solo salen las del
// workspace del usuario. Cada PDF es best-effort: un fallo aislado no rompe el resto.
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const [facturas, despacho] = await Promise.all([fetchFacturas(), fetchDespacho()]);
  const exportables = facturas.filter((f) => !f.archivado && f.estado !== "BORRADOR");
  // Facturas antiguas sin snapshot fiscal → completar y congelar antes del PDF.
  const m = await completarClienteDatosFacturas(exportables.filter((f) => !f.clienteDatos).map((f) => f.id));
  for (const f of exportables) if (!f.clienteDatos && m.has(f.id)) f.clienteDatos = m.get(f.id)!;
  if (exportables.length === 0) {
    return NextResponse.json({ error: "No hay facturas emitidas o pagadas para exportar." }, { status: 404 });
  }

  const emisor = { nombre: despacho.nombre, nif: despacho.nif, domicilio: despacho.domicilio, email: despacho.emailFacturacion };
  const entries: ZipEntry[] = [];
  const fallidas: string[] = [];
  for (const f of exportables) {
    try {
      entries.push({ name: `factura_${nombreSeguro(f.numero)}.pdf`, data: await facturaToPdf(f, emisor) });
    } catch (e) {
      fallidas.push(f.numero);
      console.error("[facturas:export] factura", f.numero, e instanceof Error ? e.message : e);
    }
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "No se pudo generar ningún PDF." }, { status: 500 });
  }
  // El ZIP es un entregable contable: si falta alguna factura, se avisa DENTRO del ZIP en
  // vez de entregar un archivo incompleto en silencio.
  if (fallidas.length > 0) {
    const aviso = `No se pudieron generar estas facturas (${fallidas.length}):\n${fallidas.join("\n")}\n\nRevisa esas facturas o vuelve a intentarlo.`;
    entries.push({ name: "_FALTAN_FACTURAS.txt", data: new TextEncoder().encode(aviso) });
  }

  const zip = crearZip(entries);
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="facturas_${hoy}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
