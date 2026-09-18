import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ES_TASA } from "@/lib/tasas";

// Guarda las tasas que el gestor deja para este expediente (selector de la pantalla
// Formularios). null = automático según el servicio; array = su curación, aunque sea
// vacía («aquí no va ninguna»). Sesión + RLS anti-IDOR.
// Fail-soft si falta la migración supabase/tasas-expediente.sql: la pantalla sigue
// funcionando, simplemente no recuerda la curación entre visitas.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { tasas?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  if (!Array.isArray(body.tasas)) return NextResponse.json({ error: "Falta la lista de tasas." }, { status: 400 });
  const tasas = [...new Set(body.tasas.filter((t): t is string => typeof t === "string" && ES_TASA(t)))];

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update({ tasas, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: true, persistido: false }); // sin migración: no-op amable
  return NextResponse.json({ ok: true, persistido: true });
}
