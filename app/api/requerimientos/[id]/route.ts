import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Un requerimiento concreto: editarlo, marcarlo aportado (o reabrirlo) y borrarlo.
//
// Todo lo decide la gestoría. Cambiar la fecha límite REARMA los avisos (ultimoAviso a
// null): si el plazo se amplía, el recordatorio vuelve a sonar cuando toque, en vez de
// callarse porque «ya avisé una vez» con la fecha vieja.
export const dynamic = "force-dynamic";

const falta = (m: string) => /relation .*Requerimiento.* does not exist|schema cache|PGRST205|column/i.test(m);

// Lectura BAJO SESIÓN: la policy requerimiento_tenant ya impide ver el de otro despacho.
async function mio(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const { data, error } = await supa.from("Requerimiento").select("id, expedienteId, asunto, fechaLimite, estado").eq("id", id).maybeSingle();
  if (error && falta(error.message)) return { error: "Falta la migración: ejecuta supabase/requerimientos.sql en Supabase.", status: 500 as const };
  if (!data) return { error: "Requerimiento no encontrado.", status: 404 as const };
  return { user, fila: data as { id: string; expedienteId: string; asunto: string; fechaLimite: string; estado: string } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { asunto?: string; fechaLimite?: string; recibidoEl?: string | null; docs?: unknown; avisarDias?: number; notas?: string | null; aportado?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const r = await mio(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const admin = createSupabaseAdmin();
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  let evento: string | null = null;

  if (typeof body.aportado === "boolean") {
    patch.estado = body.aportado ? "APORTADO" : "PENDIENTE";
    patch.aportadoEl = body.aportado ? new Date().toISOString() : null;
    // Reabrir vuelve a armar los avisos: si se reabre es que el plazo sigue vivo.
    if (!body.aportado) patch.ultimoAviso = null;
    evento = body.aportado
      ? `✅ Requerimiento aportado: ${r.fila.asunto}`
      : `↩️ Requerimiento reabierto: ${r.fila.asunto}`;
  }

  if (typeof body.asunto === "string") {
    const a = body.asunto.trim().slice(0, 400);
    if (!a) return NextResponse.json({ error: "Escribe qué te piden." }, { status: 400 });
    patch.asunto = a;
  }
  if (typeof body.fechaLimite === "string") {
    const f = new Date(body.fechaLimite);
    if (Number.isNaN(f.getTime())) return NextResponse.json({ error: "Fecha límite no válida." }, { status: 400 });
    if (f.toISOString() !== new Date(r.fila.fechaLimite).toISOString()) {
      patch.fechaLimite = f.toISOString();
      patch.ultimoAviso = null; // plazo nuevo → avisos rearmados
      evento = `📅 Plazo del requerimiento cambiado a ${f.toLocaleDateString("es-ES")}: ${r.fila.asunto}`;
    }
  }
  if (body.recibidoEl !== undefined) {
    const f = body.recibidoEl ? new Date(String(body.recibidoEl)) : null;
    patch.recibidoEl = f && !Number.isNaN(f.getTime()) ? f.toISOString() : null;
  }
  if (Array.isArray(body.docs)) patch.docs = (body.docs as unknown[]).map((d) => String(d).trim().slice(0, 120)).filter(Boolean).slice(0, 30);
  if (body.avisarDias !== undefined) {
    patch.avisarDias = Math.min(60, Math.max(1, Math.round(Number(body.avisarDias)) || 3));
    patch.ultimoAviso = null; // cambia el umbral → que vuelva a evaluarse desde cero
  }
  if (body.notas !== undefined) patch.notas = String(body.notas ?? "").trim().slice(0, 1000) || null;

  const { error } = await admin.from("Requerimiento").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: falta(error.message) ? "Falta la migración: ejecuta supabase/requerimientos.sql en Supabase." : error.message }, { status: 500 });

  if (evento) {
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: r.fila.expedienteId, tipo: "COMENTARIO", userId: r.user.id, descripcion: evento,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await mio(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Requerimiento").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: r.fila.expedienteId, tipo: "COMENTARIO", userId: r.user.id,
    descripcion: `🗑 Requerimiento eliminado: ${r.fila.asunto}`,
  });
  return NextResponse.json({ ok: true });
}
