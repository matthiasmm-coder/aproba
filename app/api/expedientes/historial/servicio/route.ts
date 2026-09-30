import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { moverHistorialAServicio } from "@/lib/historial-mover";

// Cambiar de servicio una fila MIGRADA del historial (lib/historial-mover.ts).
// POST { id: "sh_…", clave: "<clave del catálogo>" } — con la sesión: la RLS acota al despacho.
export async function POST(req: Request) {
  let body: { id?: string; clave?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const r = await moverHistorialAServicio(supa, String(body.id ?? ""), String(body.clave ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, movidas: r.movidas, label: r.label });
}
