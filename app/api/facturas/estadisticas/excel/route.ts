import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { cargarEstadisticas } from "@/lib/data/estadisticas-facturacion";
import { periodoDeParams, slugPeriodo } from "@/lib/estadisticas-facturacion";
import { fetchDespacho } from "@/lib/data/config";
import { estadisticasToXlsx } from "@/lib/estadisticas-excel";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/facturas/estadisticas/excel?anio=2026[&t=1..4] → las cifras de las estadísticas
// en Excel, con el detalle factura a factura del periodo. Bajo RLS y con la sede activa.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const url = new URL(req.url);
  const periodo = periodoDeParams(url.searchParams.get("anio"), url.searchParams.get("t"), new Date().getUTCFullYear());
  try {
    const [{ mov, est, sede }, d] = await Promise.all([cargarEstadisticas(periodo), fetchDespacho()]);
    const xlsx = estadisticasToXlsx(est, mov, { nombre: d.nombre, nif: d.nif, sede });
    return new Response(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="estadisticas-facturacion_${slugPeriodo(periodo)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo generar el Excel: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
