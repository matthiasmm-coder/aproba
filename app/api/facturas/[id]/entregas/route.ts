import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { marcarFacturaPagada } from "@/lib/cobros-tarjeta";
import { enviarConfirmacionPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { admiteEntregas, estaCubierta, saldoPendiente, r2, fetchEntregasDeFacturas } from "@/lib/entregas";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// ENTREGAS A CUENTA — el cliente paga a plazos (muy a menudo en efectivo) y el saldo
// de la factura baja solo. Cuando las entregas cubren el total, la factura pasa a
// PAGADA por el MISMO camino que el cobro normal (marcarFacturaPagada, idempotente,
// que dispara la confirmación al cliente). No hay dos maneras de cerrar una factura.
//
// RLS: la factura se lee BAJO SESIÓN (si no es de su despacho, no existe → 404).
// La escritura va con service_role, como el resto de la facturación.

async function cargar(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: f } = await supabase
    .from("Factura").select("id, workspaceId, estado, total, numero, expedienteId")
    .eq("id", id).maybeSingle();
  if (!f) return { error: NextResponse.json({ error: "Factura no encontrada." }, { status: 404 }) };
  return { supabase, user, f };
}

// GET → entregas + saldo (para refrescar el bloque sin recargar la ficha)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cargar(id);
  if (c.error) return c.error;
  const mapa = await fetchEntregasDeFacturas(c.supabase!, [id]);
  const entregas = mapa[id] ?? [];
  return NextResponse.json({ entregas, saldo: saldoPendiente(Number(c.f!.total), entregas) });
}

// POST { importe, metodo?, fecha?, nota? } → registra una entrega
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cargar(id);
  if (c.error) return c.error;
  const f = c.f!;

  if (!admiteEntregas(String(f.estado))) {
    const porque = f.estado === "PAGADA" ? "ya está pagada" : f.estado === "ANULADA" ? "está anulada" : "aún es un borrador";
    return NextResponse.json({ error: `No se pueden anotar entregas: la factura ${porque}.` }, { status: 409 });
  }

  let body: { importe?: number | string; metodo?: string; fecha?: string; nota?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const importe = r2(Number(body.importe));
  if (!Number.isFinite(importe) || importe <= 0) {
    return NextResponse.json({ error: "El importe debe ser mayor que cero." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const previas = (await fetchEntregasDeFacturas(c.supabase!, [id]))[id] ?? [];
  const saldo = saldoPendiente(Number(f.total), previas);
  // Se avisa del exceso pero NO se bloquea: en efectivo pasa (el cliente redondea,
  // paga de más y se le devuelve). Bloquearlo obligaría a mentir en el registro.
  const excede = importe > saldo;

  const fila = {
    id: uuid(), workspaceId: f.workspaceId, facturaId: id, importe,
    metodo: ["efectivo", "transferencia", "tarjeta", "otro"].includes(String(body.metodo)) ? body.metodo : "efectivo",
    ...(body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? { fecha: body.fecha } : {}),
    ...(body.nota?.trim() ? { nota: body.nota.trim().slice(0, 200) } : {}),
    creadoPor: c.user!.id,
  };
  const { error } = await admin.from("EntregaCuenta").insert(fila);
  if (error) {
    const falta = /relation .*EntregaCuenta.* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/entregas-a-cuenta.sql." : error.message }, { status: 500 });
  }

  // ¿Queda saldada? → mismo camino que el cobro normal.
  const todas = [...previas, { importe }];
  let pagada = false;
  if (estaCubierta(Number(f.total), todas)) {
    const r = await marcarFacturaPagada(admin, id, "TRANSFERENCIA");
    pagada = Boolean(r);
    if (r === "nuevo" && f.expedienteId) {
      try {
        await enviarConfirmacionPago(admin, {
          expedienteId: String(f.expedienteId), numero: String(f.numero),
          total: Number(f.total), metodo: "TRANSFERENCIA", baseUrl: baseUrlFromRequest(req),
        });
      } catch { /* la factura ya está pagada: el aviso es best-effort */ }
    }
  }
  return NextResponse.json({ ok: true, saldo: saldoPendiente(Number(f.total), todas), pagada, excede });
}

// DELETE { entregaId } → borra una entrega mal anotada (no se edita: se borra y se rehace)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cargar(id);
  if (c.error) return c.error;
  let body: { entregaId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  if (!body.entregaId) return NextResponse.json({ error: "Falta la entrega." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("EntregaCuenta").delete().eq("id", body.entregaId).eq("facturaId", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const quedan = (await fetchEntregasDeFacturas(c.supabase!, [id]))[id] ?? [];
  return NextResponse.json({ ok: true, saldo: saldoPendiente(Number(c.f!.total), quedan) });
}
