import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { asignarBandeja, descartarBandeja } from "@/lib/email-entrante-procesar";

export const runtime = "nodejs";
export const maxDuration = 60; // Vision por adjunto al colocarlos

// Bandeja de entrada (documentos recibidos por email):
//   POST   → asignar la fila a un cliente (y opcionalmente a uno de sus expedientes vivos)
//   DELETE → descartar (los adjuntos no colocados se borran del bucket)
// La fila se valida bajo sesión/RLS antes de tocar admin (anti-IDOR).

async function filaVisible(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: fila, error } = await supabase.from("BandejaEntrada").select("id, estado").eq("id", id).maybeSingle();
  if (error) return { error: NextResponse.json({ error: /BandejaEntrada|relation|schema cache/i.test(error.message) ? "Falta la migración: ejecuta supabase/email-entrante.sql." : error.message }, { status: 500 }) };
  if (!fila) return { error: NextResponse.json({ error: "Email no encontrado." }, { status: 404 }) };
  return { fila };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await filaVisible(id);
  if ("error" in v) return v.error;
  const body = await req.json().catch(() => ({}));
  const clienteId = String(body?.clienteId ?? "").trim();
  const expedienteId = String(body?.expedienteId ?? "").trim() || null;
  if (!clienteId) return NextResponse.json({ error: "Elige un cliente." }, { status: 400 });
  try {
    const r = await asignarBandeja(createSupabaseAdmin(), { filaId: id, clienteId, expedienteId, baseUrl: baseUrlFromRequest(req), motivo: "manual" });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo asignar." }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await filaVisible(id);
  if ("error" in v) return v.error;
  try {
    await descartarBandeja(createSupabaseAdmin(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo descartar." }, { status: 400 });
  }
}
