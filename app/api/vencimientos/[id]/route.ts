import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// VIGÍA — eliminar un vencimiento del radar. El gestor debe poder quitar cualquier aviso:
// una caducidad estimada que no aplica, un cliente que ya no está, un duplicado, un dato de
// prueba. NO borra el cliente ni el expediente de renovación (si lo hubiera): solo la alerta.
//
// Autorización: el vencimiento se resuelve BAJO SESIÓN (RLS) — si el usuario no es miembro
// del workspace, no existe (anti-IDOR). Solo después se borra con el admin.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: venc, error: eV } = await supa
    .from("Vencimiento")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (eV) return NextResponse.json({ error: eV.message }, { status: 500 });
  if (!venc) return NextResponse.json({ error: "Vencimiento no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error: eDel } = await admin.from("Vencimiento").delete().eq("id", id);
  if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
