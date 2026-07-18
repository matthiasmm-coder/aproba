import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { asignacionValida, clavesDeExpediente } from "@/lib/multi-servicio";

// El gestor asigna cada servicio del expediente FAMILIAR a miembros concretos
// (pedido de Juan: el padre un trámite, la madre otro). body.asignacion:
//   { "<servicioClave>": [clienteId, ...] } → guardar (solo claves del expediente
//                                             y miembros reales de la familia)
//   null                                    → quitar (vuelta al ×N clásico)
// Sesión + RLS (anti-IDOR); el dinero lo recalculan las superficies con tarifaAsignada.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { asignacion?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del gestor.
  const { data: exp, error: eSel } = await supa.from("Expediente")
    .select("id, tipo, servicioClave, serviciosExtra, familiaId").eq("id", id).maybeSingle();
  if (eSel) return NextResponse.json({ error: eSel.message }, { status: 500 });
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  if (!exp.familiaId) return NextResponse.json({ error: "La asignación por miembros es solo para expedientes familiares." }, { status: 400 });

  // null explícito = quitar; si no, validar y FILTRAR contra la realidad: solo servicios
  // del expediente y solo miembros de SU familia (un id ajeno no puede colarse en el jsonb).
  let valor: ReturnType<typeof asignacionValida> = null;
  if (body.asignacion !== null && body.asignacion !== undefined) {
    const bruta = asignacionValida(body.asignacion);
    if (!bruta) return NextResponse.json({ error: "Asignación inválida." }, { status: 400 });
    const claves = new Set(clavesDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra as string[] | null, tipo: exp.tipo }));
    const { data: miembros } = await supa.from("Cliente").select("id").eq("familiaId", exp.familiaId);
    const idsFam = new Set(((miembros ?? []) as { id: string }[]).map((m) => m.id));
    const filtrada: Record<string, string[]> = {};
    for (const [clave, ids] of Object.entries(bruta)) {
      if (!claves.has(clave)) continue;
      const propios = ids.filter((x) => idsFam.has(x));
      if (propios.length) filtrada[clave] = propios;
    }
    valor = Object.keys(filtrada).length ? filtrada : null;
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update({ serviciosAsignacion: valor, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) {
    const falta = /serviciosAsignacion|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/servicios-asignacion.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: valor
      ? `Servicios asignados por miembros (${Object.values(valor).reduce((a, l) => a + l.length, 0)} asignaciones)`
      : "Asignación por miembros retirada (todos los servicios para toda la familia)",
    userId: user.id,
  });

  return NextResponse.json({ ok: true, asignacion: valor });
}
