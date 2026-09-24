import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { esEstadoExtranjeria } from "@/lib/extranjeria";

// ESTADO EN EXTRANJERÍA (Matthias, 24/09/2026): lo que dijo la Administración en la última
// consulta del gestor, con su fecha. Hoy solo «EN_TRAMITE»: la resolución va por /salida y
// el requerimiento por /api/requerimientos. null = borrarlo. Volver a marcar «en trámite»
// renueva la fecha (sigue igual a día de hoy). Anti-IDOR: el expediente se resuelve BAJO RLS.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { estado?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const estado = body.estado === null ? null : body.estado;
  if (estado !== null && !esEstadoExtranjeria(estado)) return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
  const ahora = new Date().toISOString();

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente")
    .update({ estadoExtranjeria: estado, estadoExtranjeriaAt: estado ? ahora : null, updatedAt: ahora })
    .eq("id", id);
  if (error) {
    const falta = /estadoExtranjeria|column|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/estado-extranjeria.sql en Supabase." : error.message }, { status: 500 });
  }

  // Rastro en el historial: cuándo se miró y qué decía (útil si el cliente pregunta).
  const hoy = new Date(ahora).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id,
    descripcion: estado ? `🔎 Extranjería: en trámite (consultado el ${hoy})` : "🔎 Estado en Extranjería retirado",
  });
  return NextResponse.json({ ok: true, estado, estadoAt: estado ? ahora : null });
}
