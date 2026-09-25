import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { cargarEstadisticas } from "@/lib/data/estadisticas-facturacion";
import { periodoDeParams, slugPeriodo } from "@/lib/estadisticas-facturacion";
import { fetchDespacho } from "@/lib/data/config";
import { estadisticasToPdf } from "@/lib/estadisticas-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/facturas/estadisticas/informe?anio=2026[&t=1..4] → informe de facturación en PDF
// (Facturas › Estadísticas). Bajo RLS y con la sede de la pastilla activa.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const url = new URL(req.url);
  const periodo = periodoDeParams(url.searchParams.get("anio"), url.searchParams.get("t"), new Date().getUTCFullYear());
  try {
    const [{ mov, est, sede }, d] = await Promise.all([cargarEstadisticas(periodo), fetchDespacho()]);
    const pdf = await estadisticasToPdf(est, { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl }, { sinFechaRecibidas: mov.sinFecha.recibidas, sede });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="informe-facturacion_${slugPeriodo(periodo)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo generar el informe: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
