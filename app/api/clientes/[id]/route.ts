import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// El GESTOR edita los datos personales de un cliente desde su ficha (/app/clientes/[id]).
// Autorización: sesión + el cliente se resuelve BAJO RLS (anti-IDOR) antes de tocar nada
// con service_role — un id ajeno al workspace simplemente no existe.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { ficha?: ClienteFicha };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia al workspace bajo RLS + nombre actual (para resincronizar facturas si cambia).
  const { data: actual } = await supa.from("Cliente").select("id, workspaceId, nombre, apellidos").eq("id", id).maybeSingle();
  if (!actual) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  // Solo claves conocidas de la ficha (nunca escritura arbitraria) — mismo whitelist que el portal.
  const ficha = body.ficha ?? {};
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) {
    const v = (ficha as Record<string, unknown>)[k];
    if (typeof v === "string") patch[k] = v.trim();
  }
  if ("nombre" in patch && !patch.nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  patch.updatedAt = new Date().toISOString();

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Cliente").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // La Factura está denormalizada por clienteNombre (sin FK clienteId). Si el nombre cambia,
  // resincronizamos SOLO las facturas de ESTE cliente, vía sus expedientes — NUNCA por nombre,
  // que reasignaría las facturas de un homónimo del mismo despacho (dos «Juan García» son
  // frecuentes en extranjería). Las facturas manuales sin expediente no se resincronizan
  // (raro); conservan el nombre anterior. Fail-soft con log (no bloquea la edición).
  const nombreAntes = `${actual.nombre ?? ""} ${actual.apellidos ?? ""}`.trim();
  const nombreDespues = `${patch.nombre ?? actual.nombre ?? ""} ${patch.apellidos ?? actual.apellidos ?? ""}`.trim();
  if (nombreDespues && nombreAntes && nombreDespues !== nombreAntes) {
    const { data: exps } = await admin.from("Expediente").select("id").eq("clienteId", id);
    const expIds = (exps ?? []).map((e) => e.id as string);
    if (expIds.length) {
      const { error: eFac } = await admin.from("Factura").update({ clienteNombre: nombreDespues })
        .in("expedienteId", expIds).eq("clienteNombre", nombreAntes);
      if (eFac) console.error("[clientes:PATCH] re-sync facturas falló", { clienteId: id, error: eFac.message });
    }
  }

  return NextResponse.json({ ok: true });
}
