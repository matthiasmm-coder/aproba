import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Archiva/restaura una factura EN SERVIDOR (columna archivadoAt): la saca de la lista de
// trabajo y de los cobros pendientes SIN borrarla (documento contable). Estado compartido
// por los 3 usuarios del despacho. Autorización: la factura se resuelve BAJO SESIÓN (RLS)
// antes de usar el admin; cualquier miembro del workspace puede archivar (no es destructivo).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { archivado?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: f } = await supa.from("Factura").select("id").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("Factura")
    .update({ archivadoAt: body.archivado ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    // Columna sin migrar → error controlado (la lista sigue funcionando sin archivar).
    const sinMigrar = /column|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: sinMigrar ? "Falta la migración supabase/factura-archivado.sql." : error.message },
      { status: sinMigrar ? 501 : 500 },
    );
  }
  return NextResponse.json({ ok: true, archivado: Boolean(body.archivado) });
}
