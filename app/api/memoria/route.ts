import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchMemoria } from "@/lib/data/memoria";
import { fetchDespacho } from "@/lib/data/config";
import { memoriaToPdf } from "@/lib/memoria-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const valida = (s: string | null): s is string => Boolean(s && ES_FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)));

// GET /api/memoria?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&formato=json]
// → PDF de la memoria de actividad del artículo 8.1.f (o JSON, que es lo que consume
//   la vista previa de Ajustes antes de descargar). Sin período → el año en curso.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = url.searchParams.get("desde") ?? `${hoy.slice(0, 4)}-01-01`;
  const hasta = url.searchParams.get("hasta") ?? hoy;
  if (!valida(desde) || !valida(hasta)) {
    return NextResponse.json({ error: "Fechas no válidas. Formato AAAA-MM-DD." }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha inicial es posterior a la final." }, { status: 400 });
  }

  const memoria = await fetchMemoria(desde, hasta);
  if (url.searchParams.get("formato") === "json") return NextResponse.json(memoria);

  const d = await fetchDespacho();
  const pdf = await memoriaToPdf(memoria, { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="memoria_actividad_${desde}_${hasta}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
