import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { COLUMNAS_OPCIONALES_TABLA, SELECT_TABLA, filaTabla, type RowTabla } from "@/lib/expedientes-tabla";

// Filas de la VISTA TABLA (23/09/2026; restaurada el 28/09 a petición de Jennifer). Lectura BAJO SESIÓN: la RLS
// limita al despacho, y la sede mirada (pastilla) filtra como en el resto de Expedientes.
// ?archivados=1 → el historial; si no, lo que está en curso.
// Desde el 03/10/2026 la Tabla se EDITA (colaborador, fecha de presentación, tramitado por,
// resolución, tasa pagada): la respuesta trae también el equipo (para «Tramitado por») y si
// la base ya tiene las columnas nuevas (supabase/expediente-tabla.sql).
export const dynamic = "force-dynamic";

const POST_PRESENTACION = new Set(["PRESENTADO", "RESUELTO", "RECHAZADO", "FINALIZADO", "CITA_HUELLAS"]);

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
  // Sin alguna migración (nº oficial, salida, columnas de la Tabla) la tabla sale igual: la
  // columna que la base no conoce se quita y se vuelve a pedir, una a una.
  let sel = SELECT_TABLA;
  let { data, error } = await consulta(sel);
  for (let i = 0; error && i < COLUMNAS_OPCIONALES_TABLA.length; i++) {
    const msg = error.message;
    const col = COLUMNAS_OPCIONALES_TABLA.find((c) => sel.includes(`${c}, `) && new RegExp(`\\b${c}\\b`, "i").test(msg));
    if (!col) break;
    sel = sel.replace(`${col}, `, "");
    ({ data, error } = await consulta(sel));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as unknown as RowTabla[];

  // Fecha de presentación de los expedientes ANTERIORES al sellado de la columna: la del
  // primer evento PRESENTADO (la misma reserva que la lista y la ficha). Solo si hace falta.
  const fechaEvento = new Map<string, string>();
  if (filas.some((r) => POST_PRESENTACION.has(String(r.estado)) && !r.fechaPresentacion)) {
    const { data: evs } = await supabase.from("ExpedienteEvento").select("expedienteId, createdAt")
      .eq("tipo", "PRESENTADO").order("createdAt", { ascending: true }).limit(2000);
    for (const ev of (evs ?? []) as { expedienteId: string; createdAt: string }[]) {
      if (!fechaEvento.has(ev.expedienteId)) fechaEvento.set(ev.expedienteId, ev.createdAt);
    }
  }

  // El equipo del despacho, para la celda «Tramitado por» (la RLS deja ver el propio).
  const { data: mems } = await supabase.from("Membership").select("userId, User(nombre, email)");
  type U = { nombre: string | null; email: string | null };
  const miembros = ((mems ?? []) as { userId: string; User: U | U[] | null }[])
    .map((m) => { const u = Array.isArray(m.User) ? m.User[0] : m.User; return { id: m.userId, nombre: u?.nombre || u?.email || "Usuario" }; })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return NextResponse.json({
    filas: filas.map((r) => filaTabla(r, POST_PRESENTACION.has(String(r.estado)) ? fechaEvento.get(r.id) : null)),
    miembros,
    migracion: sel.includes("colaborador, ") && sel.includes("tasaPagadaEl, "),
  });
}
