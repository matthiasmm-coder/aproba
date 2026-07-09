import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarSolicitudPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// El gestor pulsa «Recordar» en la vista de cobros pendientes → reenvía al cliente
// el email con la factura (IBAN + botón de tarjeta si está activo). Reutiliza la
// misma plantilla que la solicitud inicial. RLS valida que la factura es del
// workspace del usuario ANTES de tocar nada con service_role.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si la factura pertenece a un workspace del usuario.
  const { data: fac } = await supabase
    .from("Factura")
    .select("id, numero, concepto, total, estado, expedienteId")
    .eq("id", id)
    .maybeSingle();
  if (!fac) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (fac.estado === "PAGADA" || fac.estado === "ANULADA") {
    return NextResponse.json({ error: "Esta factura ya no está pendiente de cobro." }, { status: 409 });
  }
  if (!fac.expedienteId) {
    return NextResponse.json({ error: "Esta factura no está vinculada a un expediente, no se puede recordar al cliente automáticamente." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  // El cliente debe tener email para poder recibir el recordatorio.
  const { data: expRaw } = await admin.from("Expediente").select("Cliente(email)").eq("id", fac.expedienteId).maybeSingle();
  const cli = (expRaw as { Cliente?: { email?: string | null } | { email?: string | null }[] } | null)?.Cliente;
  const email = (Array.isArray(cli) ? cli[0] : cli)?.email;
  if (!email) return NextResponse.json({ error: "El cliente no tiene email registrado." }, { status: 400 });

  await enviarSolicitudPago(admin, {
    expedienteId: fac.expedienteId,
    facturaId: fac.id,
    numero: String(fac.numero),
    total: Number(fac.total),
    concepto: String(fac.concepto),
    baseUrl: baseUrlFromRequest(req),
  });

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: fac.expedienteId,
    tipo: "NOTIFICACION_ENVIADA",
    descripcion: `🔔 Recordatorio de pago enviado al cliente (factura ${fac.numero})`,
  });

  return NextResponse.json({ ok: true });
}
