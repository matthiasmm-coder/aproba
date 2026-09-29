import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchFacturadoAnterior } from "@/lib/data/estadisticas-facturacion";
import { resolverOficina } from "@/lib/data/oficina-filtro";

export const runtime = "nodejs";

// GET /api/facturas/anteriores?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → lo facturado ANTES de
// Aproba (migración) en ese periodo, para el CSV de Facturas › Emitidas (pedido de Luis,
// 29/09/2026). Bajo RLS y con la sede de la pastilla activa, como la lista y las estadísticas.
// Se pide al pulsar «CSV»: la página no carga cientos de filas que casi nunca se miran.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") ?? "", hasta = url.searchParams.get("hasta") ?? "";
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return NextResponse.json({ error: "Periodo no válido." }, { status: 400 });
  try {
    const filtro = await resolverOficina().catch(() => null);
    const { filas } = await fetchFacturadoAnterior(filtro?.sedes ?? null, filtro?.incluirSinSede ?? false);
    const enPeriodo = filas.filter((f) => f.fecha >= desde && f.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.ref ?? "").localeCompare(b.ref ?? ""));
    return NextResponse.json({ filas: enPeriodo }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer lo facturado antes de Aproba: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
