import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { sembrarEjemplo, borrarEjemplo } from "@/lib/ejemplo";

async function contexto() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return null;
  return { user, admin, ws: mem.workspaceId as string, rol: mem.role as string };
}

// POST → siembra (o devuelve) el expediente de ejemplo del despacho.
export async function POST() {
  const c = await contexto();
  if (!c) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    const r = await sembrarEjemplo(c.admin, c.ws, c.user.id);
    return NextResponse.json({ ok: true, expedienteId: r.id, creado: r.creado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el ejemplo." }, { status: 500 });
  }
}

// DELETE → lo borra del todo (archivos, documentos, diario y cliente ficticio). Administradores.
export async function DELETE() {
  const c = await contexto();
  if (!c) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!puedeGestionarEquipo(c.rol)) return NextResponse.json({ error: "Solo un administrador puede borrar el ejemplo." }, { status: 403 });
  try {
    const borrado = await borrarEjemplo(c.admin, c.ws);
    return NextResponse.json({ ok: true, borrado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar el ejemplo." }, { status: 500 });
  }
}
