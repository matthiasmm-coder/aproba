import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Asignar un expediente a un miembro del equipo.
//
// Sin esto, `asignadoAId` se fijaba al crearlo y no volvía a moverse nunca — de
// modo que un ASISTENTE (que solo ve lo suyo, ver supabase/roles-asistente.sql)
// únicamente vería lo que él mismo hubiera creado, y nadie podría encargarle nada.
//
// Quién puede asignar: cualquiera menos el ASISTENTE. Si pudiera reasignar, podría
// quitarse de encima un expediente y perderlo de vista, o dárselo a otro sin que
// nadie lo decida. Reparte quien dirige el trabajo.
//
// Anti-IDOR: el expediente se resuelve BAJO RLS (un id ajeno no existe) y el
// destinatario se comprueba miembro del MISMO workspace antes de escribir.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { userId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  const ws = (exp as { workspaceId: string }).workspaceId;

  const admin = createSupabaseAdmin();
  const { data: yo } = await admin.from("Membership").select("role").eq("userId", user.id).eq("workspaceId", ws).maybeSingle();
  const miRol = (yo as { role?: string } | null)?.role;
  if (!miRol) return NextResponse.json({ error: "No perteneces a este despacho." }, { status: 403 });
  if (miRol === "ASISTENTE") return NextResponse.json({ error: "No puedes reasignar expedientes." }, { status: 403 });

  // null / "" = quitar la asignación (vuelve a «Sin asignar»).
  let userId: string | null = null;
  if (body.userId !== null && body.userId !== undefined && String(body.userId) !== "") {
    userId = String(body.userId);
    const { data: destino } = await admin.from("Membership").select("userId").eq("userId", userId).eq("workspaceId", ws).maybeSingle();
    if (!destino) return NextResponse.json({ error: "Esa persona no está en tu equipo." }, { status: 404 });
  }

  const { error } = await admin.from("Expediente").update({ asignadoAId: userId, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Traza en el historial: quién lleva un expediente es una decisión, no un detalle.
  const { data: u } = userId ? await admin.from("User").select("nombre, email").eq("id", userId).maybeSingle() : { data: null };
  const nombre = (u as { nombre?: string | null; email?: string | null } | null);
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id,
    descripcion: userId
      ? `Expediente asignado a ${nombre?.nombre || nombre?.email || "un miembro del equipo"}`
      : "Expediente sin asignar",
  });

  return NextResponse.json({ ok: true, asignadoAId: userId });
}
