import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosConfig } from "@/lib/data/config";
import { SERVICIO_A_TIPO, TIPO_LABEL } from "@/lib/tramites";

// El GESTOR corrige el servicio/trámite de un expediente desde su ficha (p. ej. eligió
// mal el tipo al crearlo). Sesión + el expediente se resuelve BAJO RLS (anti-IDOR).
// NO toca el estado del expediente (solo tipo + servicioClave) — es una corrección.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clave?: string; label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const clave = (body.clave ?? "").trim();
  if (!clave) return NextResponse.json({ error: "Falta el servicio." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id, familiaId, servicioClave").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  // Los expedientes familiares tienen precio ×N y lógica propia: su servicio se gestiona
  // desde la sección de familia, no aquí.
  if (exp.familiaId) return NextResponse.json({ error: "Cambia el servicio desde la sección de familia." }, { status: 409 });
  // No-op: sin cambio real, no se escribe ni se registra evento.
  if (exp.servicioClave === clave) return NextResponse.json({ ok: true });

  // El servicio debe ser uno de los configurados por el despacho (bajo RLS del gestor).
  const { servicios } = await fetchServiciosConfig();
  if (!servicios.some((s) => s.id === clave)) return NextResponse.json({ error: "Servicio no válido." }, { status: 400 });

  const tipo = SERVICIO_A_TIPO[clave] ?? "OTRO";
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente")
    .update({ tipo, servicioClave: clave, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const etiqueta = (body.label ?? "").trim() || TIPO_LABEL[tipo] || tipo;
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: id,
    tipo: "ESTADO_CAMBIADO",
    descripcion: `Servicio cambiado a: ${etiqueta}`,
  });

  return NextResponse.json({ ok: true });
}
