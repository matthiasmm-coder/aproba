import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { normalizarCamposEditados, camposParaDb } from "@/lib/facturas-recibidas";
import { COLS_RECIBIDA, mapFilaRecibida } from "@/lib/facturas-recibidas-guardar";

export const runtime = "nodejs";

// PATCH → corregir los datos leídos (cualquier miembro) · DELETE → eliminar archivo + fila
// (solo administradores, como las facturas emitidas). La fila se relee bajo RLS antes de
// tocar admin (anti-IDOR).

async function filaVisible(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: fila, error } = await supabase.from("FacturaRecibida").select("id, workspaceId, archivoPath").eq("id", id).maybeSingle();
  if (error) return { error: NextResponse.json({ error: /FacturaRecibida|relation|schema cache/i.test(error.message) ? "Falta la migración: ejecuta supabase/facturas-recibidas.sql." : error.message }, { status: 500 }) };
  if (!fila) return { error: NextResponse.json({ error: "Factura no encontrada." }, { status: 404 }) };
  return { fila: fila as { id: string; workspaceId: string; archivoPath: string }, user, supabase };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await filaVisible(id);
  if ("error" in v) return v.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  const campos = normalizarCamposEditados(body as Record<string, unknown>);
  if (campos.expedienteId) {
    // El expediente debe ser del mismo despacho (RLS lo garantiza al leerlo con la sesión).
    const { data: e } = await v.supabase.from("Expediente").select("id").eq("id", campos.expedienteId).maybeSingle();
    if (!e) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  // El gestor ha revisado: deja de estar marcada.
  const { data, error } = await admin.from("FacturaRecibida").update({ ...camposParaDb(campos), revisar: false, updatedAt: new Date().toISOString() }).eq("id", id).select(COLS_RECIBIDA).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, factura: mapFilaRecibida(data as Record<string, unknown>) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await filaVisible(id);
  if ("error" in v) return v.error;
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("role").eq("userId", v.user.id).eq("workspaceId", v.fila.workspaceId).maybeSingle();
  if (!puedeGestionarEquipo((mem?.role as string) ?? "")) return NextResponse.json({ error: "Solo un administrador puede eliminar facturas recibidas." }, { status: 403 });
  const { error } = await admin.from("FacturaRecibida").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (v.fila.archivoPath) await admin.storage.from("documentos").remove([v.fila.archivoPath]).catch(() => {});
  return NextResponse.json({ ok: true });
}
