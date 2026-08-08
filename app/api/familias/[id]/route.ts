import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ELIMINAR (disolver) una familia: los miembros vuelven a ser clientes individuales
// (familiaId + parentesco a null — NUNCA se borra a las personas) y los expedientes
// familiares pasan a ser individuales de su solicitante (familiaId a null; la FK ya es
// ON DELETE SET NULL, se hace explícito para limpiar también parentesco de forma
// determinista). Autorización: sesión + la familia se resuelve BAJO RLS (anti-IDOR).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: fam } = await supa.from("Familia").select("id, nombre").eq("id", id).maybeSingle();
  if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const ahora = new Date().toISOString();
  const { error: eM } = await admin.from("Cliente").update({ familiaId: null, parentesco: null, updatedAt: ahora }).eq("familiaId", id);
  if (eM) return NextResponse.json({ error: eM.message }, { status: 500 });
  // Fail-soft: si la columna Expediente.familiaId no existe (pre-migración), la FK no existe tampoco.
  await admin.from("Expediente").update({ familiaId: null }).eq("familiaId", id).then(() => {}, () => {});
  const { error: eF } = await admin.from("Familia").delete().eq("id", id);
  if (eF) return NextResponse.json({ error: eF.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
