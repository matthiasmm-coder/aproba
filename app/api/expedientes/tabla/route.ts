import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { SELECT_TABLA, filaTabla, type RowTabla } from "@/lib/expedientes-tabla";

// Filas de la VISTA TABLA (prototipo local, 23/09/2026). Lectura BAJO SESIÓN: la RLS
// limita al despacho, y la sede mirada (pastilla) filtra como en el resto de Expedientes.
// ?archivados=1 → el historial; si no, lo que está en curso.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const archivados = new URL(req.url).searchParams.get("archivados") === "1";
  const filtroSede = await resolverOficina();

  const consulta = (sel: string) => {
    let q = supabase.from("Expediente").select(sel);
    q = archivados ? q.not("archivadoAt", "is", null) : q.is("archivadoAt", null);
    if (filtroSede.sedes?.length) {
      const dentro = `oficinaId.in.(${filtroSede.sedes.join(",")})`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).or(filtroSede.incluirSinSede ? `${dentro},oficinaId.is.null` : dentro);
    }
    return q.order("createdAt", { ascending: false }).limit(3000);
  };
  let { data, error } = await consulta(SELECT_TABLA);
  // Sin supabase/numero-oficial.sql: la tabla sale igual, con la columna vacía.
  if (error && /numeroOficial/i.test(error.message)) ({ data, error } = await consulta(SELECT_TABLA.replace("numeroOficial, ", "")));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ filas: ((data ?? []) as unknown as RowTabla[]).map(filaTabla) });
}
