import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ivaDe, totalDe, totalesFactura } from "@/lib/facturas";
import { enviarSolicitudPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// Edición de una factura YA emitida (retocar el pago final o el anticipo desde el popup
// del expediente). RLS: la lectura bajo sesión valida que la factura es del workspace del
// usuario; la escritura va por service_role (tabla Factura bloqueada). Reenvío opcional al
// cliente con la factura corregida (solo si aún está pendiente).

// Carga una factura para pre-rellenar el editor.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const sel = (cols: string) => supabase.from("Factura").select(cols).eq("id", id).maybeSingle();
  let res = await sel("id, numero, clienteNombre, concepto, baseImponible, lineas, suplidos, notas, momento, estado, expedienteId");
  if (res.error) res = await sel("id, numero, clienteNombre, concepto, baseImponible, momento, estado, expedienteId");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  return NextResponse.json(res.data);
}

// Actualiza una factura existente (nº, cliente, líneas, suplidos, notas, importe).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Valida propiedad bajo RLS antes de tocar nada.
  const { data: f } = await supabase.from("Factura").select("id, estado, expedienteId, numero, concepto").eq("id", id).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  // Integridad contable: una factura ya pagada NO se reescribe.
  if (f.estado === "PAGADA") return NextResponse.json({ error: "No se puede modificar una factura ya pagada." }, { status: 409 });

  let body: { numero?: string; clienteNombre?: string; concepto?: string; baseImponible?: number; lineas?: { concepto: string; base: number }[]; suplidos?: { concepto: string; importe: number }[]; notas?: string | null; notificar?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  // Totales recalculados en el servidor (suplidos sin IVA).
  let baseImponible: number, iva: number, total: number;
  const patch: Record<string, unknown> = {};
  const ls = Array.isArray(body.lineas) ? body.lineas.filter((l) => l?.concepto?.trim() && Number(l.base) > 0) : [];
  if (ls.length) {
    const ss = Array.isArray(body.suplidos) ? body.suplidos.filter((s) => s?.concepto?.trim() && Number(s.importe) > 0) : [];
    const tt = totalesFactura(ls, ss);
    baseImponible = tt.base; iva = tt.iva; total = tt.total;
    patch.lineas = ls; patch.suplidos = ss; patch.notas = body.notas?.trim() || null;
  } else {
    baseImponible = Number(body.baseImponible) || 0; iva = ivaDe(baseImponible); total = totalDe(baseImponible);
    patch.lineas = null; patch.suplidos = null; patch.notas = body.notas?.trim() || null;
  }
  if (total <= 0) return NextResponse.json({ error: "El importe de la factura debe ser mayor que 0" }, { status: 400 });

  const numero = body.numero?.trim() || String(f.numero);
  patch.numero = numero;
  patch.baseImponible = baseImponible; patch.iva = iva; patch.total = total;
  if (body.clienteNombre?.trim()) patch.clienteNombre = body.clienteNombre.trim();
  if (body.concepto?.trim()) patch.concepto = body.concepto.trim();

  const admin = createSupabaseAdmin();
  const { error: eUp } = await admin.from("Factura").update(patch).eq("id", id);
  if (eUp) {
    const dup = /duplicate|unique/i.test(eUp.message);
    const faltaMig = /lineas|suplidos|schema cache|column/i.test(eUp.message);
    return NextResponse.json(
      { error: dup ? "Ese número de factura ya existe. Cámbialo." : faltaMig ? "Falta la migración de facturas avanzadas: ejecuta supabase/factura-lineas.sql." : eUp.message },
      { status: dup ? 409 : 500 },
    );
  }

  // Reenvío opcional al cliente con la factura corregida (no para facturas ya pagadas).
  let avisado = false;
  if (body.notificar && f.estado !== "PAGADA" && f.expedienteId) {
    const conceptoEmail = body.concepto?.trim() || String(f.concepto ?? "Factura");
    await enviarSolicitudPago(admin, { expedienteId: String(f.expedienteId), facturaId: id, numero, total, concepto: conceptoEmail, baseUrl: baseUrlFromRequest(req) });
    avisado = true;
  }
  return NextResponse.json({ ok: true, total, numero, avisado });
}
