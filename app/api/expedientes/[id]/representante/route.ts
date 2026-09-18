import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Persiste «el despacho presenta este expediente como representante» (interruptor de la
// pantalla Formularios), para que TODOS los canales —descarga, ZIP, portal del cliente,
// respuesta por email— rellenen o dejen en blanco la misma sección.
// Sesión + RLS anti-IDOR. Fail-soft si falta la migración supabase/presenta-gestor.sql:
// el interruptor sigue actuando en la descarga por query param, simplemente sin memoria.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { valor?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const valor = Boolean(body.valor);

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia bajo RLS: si no es de su despacho, no existe.
  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente")
    .update({ presentaGestor: valor, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: true, persistido: false }); // sin migración: no-op amable
  return NextResponse.json({ ok: true, persistido: true });
}
