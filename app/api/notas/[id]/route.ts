import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Editar / borrar una nota de trabajo. La nota se resuelve BAJO RLS (solo se ve si es de un
// workspace del usuario) antes de escribir con el admin — anti-IDOR. Es un bloc compartido
// del despacho: cualquier miembro del workspace puede editar o borrar.
async function resolverNota(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: nota } = await supa.from("ExpedienteNota").select("id").eq("id", id).maybeSingle();
  if (!nota) return { error: NextResponse.json({ error: "Nota no encontrada." }, { status: 404 }) };
  return { ok: true as const };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { texto?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "La nota está vacía." }, { status: 400 });
  if (texto.length > 4000) return NextResponse.json({ error: "La nota es demasiado larga." }, { status: 400 });

  const r = await resolverNota(id);
  if ("error" in r) return r.error;

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("ExpedienteNota").update({ texto, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolverNota(id);
  if ("error" in r) return r.error;

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("ExpedienteNota").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
