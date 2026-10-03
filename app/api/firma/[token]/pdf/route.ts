import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sobrePorToken } from "@/lib/firma/servicio";
import { esDocFirmable } from "@/lib/firma/sobre";

// El PDF de un documento del sobre: el ORIGINAL que se revisa (pendiente) o, ya firmado, el
// documento firmado con su certificado (?firmado=1). ?descargar=1 → como archivo.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const doc = url.searchParams.get("doc");
  if (!esDocFirmable(doc)) return NextResponse.json({ error: "Documento desconocido." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const s = await sobrePorToken(admin, token);
  if (!s || s.estado === "ANULADO") return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const d = s.documentos.find((x) => x.doc === doc);
  if (!d) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const firmado = url.searchParams.get("firmado") === "1" && d.firmadoPath;
  const { data, error } = await admin.storage.from("documentos").download(firmado ? d.firmadoPath! : d.path);
  if (error || !data) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const nombre = `${d.titulo}${firmado ? " firmado" : ""}.pdf`.replace(/[^\w .()-]+/g, "_");
  return new Response(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("descargar") === "1" ? "attachment" : "inline"}; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
