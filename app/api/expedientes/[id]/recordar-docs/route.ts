import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarRecordatorioDocs } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// El gestor pulsa «Recordar al cliente» en el aviso de documentos pendientes.
// Reenvía al cliente un email con la lista de documentos que faltan + el enlace
// para subirlos. RLS valida que el expediente es del workspace del usuario.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: own } = await supabase.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const r = await enviarRecordatorioDocs(admin, { expedienteId: id, baseUrl: baseUrlFromRequest(req) });

  if (r.motivo === "sin_faltan") return NextResponse.json({ error: "Ya no faltan documentos." }, { status: 409 });
  if (r.motivo === "sin_email") return NextResponse.json({ error: "El cliente no tiene email registrado." }, { status: 400 });
  if (r.motivo === "error") return NextResponse.json({ error: "No se pudo enviar el recordatorio." }, { status: 500 });
  // enviado o simulado (sin RESEND) → ok para el gestor
  return NextResponse.json({ ok: true, enviado: r.enviado, faltan: r.faltan });
}
