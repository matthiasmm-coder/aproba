import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarNumeroOficial } from "@/lib/numero-oficial";

// Nº de expediente OFICIAL (el que asigna Extranjería) — petición de Jennifer, 23/09/2026.
// Lo escribe cualquier miembro del despacho: es un dato que llega con la resolución o el
// justificante, y quien lo tiene delante es quien lo apunta. "" o null = borrarlo.
// Anti-IDOR: el expediente se resuelve BAJO RLS (un id ajeno no existe).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { numeroOficial?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const numero = normalizarNumeroOficial(body.numeroOficial);
  const admin = createSupabaseAdmin();
  const { data: antes, error: eLeer } = await admin.from("Expediente").select("numeroOficial").eq("id", id).maybeSingle();
  if (eLeer) {
    const falta = /numeroOficial|column|schema cache/i.test(eLeer.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/numero-oficial.sql en Supabase." : eLeer.message }, { status: 500 });
  }
  const previo = String((antes as { numeroOficial?: string | null } | null)?.numeroOficial ?? "");
  if (previo === numero) return NextResponse.json({ ok: true, numeroOficial: numero, sinCambios: true });

  const { error } = await admin.from("Expediente").update({ numeroOficial: numero || null, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rastro en el historial: un número oficial mal copiado es un error que hay que poder rastrear.
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id,
    descripcion: numero
      ? `🏛 Nº de expediente de Extranjería: ${numero}${previo ? ` (antes ${previo})` : ""}`
      : `🏛 Nº de expediente de Extranjería retirado (era ${previo})`,
  });
  return NextResponse.json({ ok: true, numeroOficial: numero });
}
