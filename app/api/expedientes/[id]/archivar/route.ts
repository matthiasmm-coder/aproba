import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Archiva/restaura un expediente EN SERVIDOR (columna archivadoAt): el estado es el
// mismo para los 3 usuarios del despacho, en cualquier puesto/navegador.
// Autorización: el expediente se resuelve BAJO SESIÓN (RLS) antes de usar el admin.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { archivado?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("Expediente")
    .update({ archivadoAt: body.archivado ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    // Columna sin migrar → el cliente sigue con localStorage (repli propre).
    const sinMigrar = /column|does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: sinMigrar ? "Falta la migración supabase/archivado.sql." : error.message }, { status: sinMigrar ? 501 : 500 });
  }
  return NextResponse.json({ ok: true, archivado: Boolean(body.archivado) });
}
