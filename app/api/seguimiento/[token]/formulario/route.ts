import { NextResponse } from "next/server";
import { fetchExpedienteDetallePorToken } from "@/lib/data/expedientes";
import { datosNormalizados } from "@/lib/formularios";
import { rellenarOficial, formulariosParaTramite } from "@/lib/ex-forms";

export const runtime = "nodejs";

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
// Mismo orden de estados que la página de seguimiento.
const ORDEN: Record<string, number> = {
  BORRADOR: 0, DOCS_PENDIENTES: 1, DOCS_VALIDADOS: 2, FORM_GENERADO: 3,
  PRESENTADO: 4, RESUELTO: 5, CITA_HUELLAS: 6, FINALIZADO: 7, RECHAZADO: 4,
};

// GET ?tipo=EX-17 → el cliente descarga el formulario oficial relleno con SUS datos.
// El portalToken ES la credencial. Solo se sirve si (1) los formularios ya están
// generados y (2) el modelo corresponde al trámite de ese expediente.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";

  const exp = await fetchExpedienteDetallePorToken(token);
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if ((ORDEN[exp.estado] ?? 0) < ORDEN.FORM_GENERADO) {
    return NextResponse.json({ error: "Los formularios aún no están listos." }, { status: 403 });
  }
  if (!formulariosParaTramite(exp.tipoEnum).includes(tipo)) {
    return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });
  }

  const pdf = await rellenarOficial(tipo, datosNormalizados(exp), exp.tipoEnum);
  if (!pdf) return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${limpiar(tipo)}_${limpiar(exp.referencia)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
