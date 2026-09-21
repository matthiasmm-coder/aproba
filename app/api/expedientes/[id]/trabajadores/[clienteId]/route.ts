import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFilaTrabajador } from "@/lib/data/trabajadores";
import { motivoNoQuitar, nombreCompleto } from "@/lib/trabajadores";

// Un trabajador DENTRO de un expediente de empresa (21/09/2026):
//   DELETE → lo quita del expediente (la persona sigue existiendo en Clientes). Solo si no
//            dejó rastro: con documentos o formularios a su nombre en este expediente se
//            rechaza y se dice qué quitar antes — nada queda huérfano.
//   PATCH  → { presentado: boolean } marca/desmarca SU presentación ante la
//            Administración (los trabajadores de un lote se presentan en fechas distintas).
// Bajo RLS: el expediente se resuelve con la sesión; la escritura va con service_role.

const uuid = () => crypto.randomUUID();

async function contexto(id: string, clienteId: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId, formulariosPorMiembro").eq("id", id).maybeSingle();
  if (!exp) return { error: NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 }) };
  const fila = await fetchFilaTrabajador(id, clienteId, supa);
  if (!fila) return { error: NextResponse.json({ error: "Este trabajador no está en el expediente." }, { status: 404 }) };
  const { data: c } = await supa.from("Cliente").select("nombre, apellidos").eq("id", clienteId).maybeSingle();
  const nombre = c ? nombreCompleto(c as { nombre: string; apellidos: string | null }) : "";
  return { supa, user, exp: exp as { id: string; workspaceId: string; formulariosPorMiembro: Record<string, string[]> | null }, fila, nombre };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; clienteId: string }> }) {
  const { id, clienteId } = await params;
  const ctx = await contexto(id, clienteId);
  if ("error" in ctx) return ctx.error;
  const { supa, user, exp, fila, nombre } = ctx;

  const { count } = await supa.from("Documento").select("id", { count: "exact", head: true }).eq("expedienteId", id).eq("clienteId", clienteId);
  const nFormularios = (exp.formulariosPorMiembro?.[clienteId] ?? []).length;
  const motivo = motivoNoQuitar({ nDocumentos: count ?? 0, nFormularios });
  if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("ExpedienteTrabajador").delete().eq("id", fila.id).eq("workspaceId", exp.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: id, tipo: "COMENTARIO", descripcion: `Trabajador quitado del expediente: ${nombre}`, userId: user.id });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; clienteId: string }> }) {
  const { id, clienteId } = await params;
  let body: { presentado?: boolean; enlaceEnviado?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  if (typeof body.presentado !== "boolean" && body.enlaceEnviado !== true) return NextResponse.json({ error: "Falta «presentado» o «enlaceEnviado»." }, { status: 400 });
  const ctx = await contexto(id, clienteId);
  if ("error" in ctx) return ctx.error;
  const { user, exp, fila, nombre } = ctx;

  // Constancia de que el gestor le mandó su enlace (copiar / WhatsApp): solo la primera vez.
  if (body.enlaceEnviado === true && typeof body.presentado !== "boolean") {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("ExpedienteTrabajador").update({ enlaceEnviadoAt: new Date().toISOString() }).eq("id", fila.id).eq("workspaceId", exp.workspaceId).is("enlaceEnviadoAt", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: id, tipo: "NOTIFICACION_ENVIADA", descripcion: `Enlace individual enviado a ${nombre}`, userId: user.id });
    return NextResponse.json({ ok: true });
  }

  const presentadoAt = body.presentado ? new Date().toISOString() : null;
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("ExpedienteTrabajador").update({ presentadoAt }).eq("id", fila.id).eq("workspaceId", exp.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: body.presentado ? `Presentado el expediente de ${nombre}` : `Desmarcado como presentado: ${nombre}`,
    userId: user.id,
  });
  return NextResponse.json({ ok: true, presentadoAt });
}
