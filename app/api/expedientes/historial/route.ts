import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { fetchHistorialFilas } from "@/lib/data/historial";

// Filas de UNA carpeta del archivo (servicio + año), o de una búsqueda en el archivo.
// Todo pasa por la sesión: la RLS de "Expediente" (tenant + asistente + sede) filtra
// dentro de la función SQL, y la pastilla de sede se añade como filtro explícito.
export async function GET(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const u = new URL(req.url);
  const p = (k: string) => (u.searchParams.has(k) ? u.searchParams.get(k) ?? "" : null);
  const filtro = await resolverOficina();

  const filas = await fetchHistorialFilas({
    sedes: filtro.sedes, incluirSinSede: filtro.incluirSinSede,
    servicio: p("servicio"), tipo: p("tipo"), anio: p("anio"), q: p("q"), asignado: p("asignado"), salida: p("salida"),
    limit: Number(u.searchParams.get("limit")) || 50,
    offset: Number(u.searchParams.get("offset")) || 0,
  });
  // null = migración pendiente: el cliente ya sabe volver al modo anterior.
  if (!filas) return NextResponse.json({ error: "historial_no_disponible" }, { status: 503 });
  return NextResponse.json({ filas });
}
