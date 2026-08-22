import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarFinalizacion } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// FLUJO «FINALIZAR Y ARCHIVAR» (22/08, pedido de Matthias) — el correo de cierre. El
// llamante ya decidió en el popup si factura lo pendiente (y emitió la factura vía
// /api/pagos con sinEmail) y ya movió el estado (avanzar finalizar con sinAviso): aquí
// solo se compone y envía UN email — finalización + liquidación final si la hay.
//
// Autorización: sesión + RLS. Cliente sin email → { enviado: "SIN_CONTACTO" }, sin
// error: el cierre y el archivado no dependen de poder avisar a nadie.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { facturaId?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();

  // La factura debe pertenecer a ESTE expediente (un facturaId ajeno no puede colarse).
  let factura: { facturaId: string; numero: string; total: number } | null = null;
  const facturaId = typeof body.facturaId === "string" ? body.facturaId.trim() : "";
  if (facturaId) {
    const { data: f } = await admin.from("Factura").select("id, numero, total").eq("id", facturaId).eq("expedienteId", id).maybeSingle();
    if (!f) return NextResponse.json({ error: "Factura no encontrada en este expediente." }, { status: 404 });
    factura = { facturaId: f.id as string, numero: f.numero as string, total: Number(f.total) };
  }

  const estado = await enviarFinalizacion(admin, { expedienteId: id, factura, baseUrl: baseUrlFromRequest(req) });
  if (estado === "ERROR") {
    return NextResponse.json({ error: "No se pudo enviar el email de finalización. Vuelve a intentarlo." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, enviado: estado, factura: factura ? { numero: factura.numero, total: factura.total } : null });
}
