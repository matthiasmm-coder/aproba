import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { limiteExpedientes } from "@/lib/planes";
import { stripeDisponible, cobrarExpedienteExtra } from "@/lib/billing";

// Creación de un expediente DESDE EL SERVIDOR (antes era client-side). Se hace aquí para
// poder decidir, de forma autoritativa y no falsificable, el cobro del excedente: si el
// despacho supera su límite mensual (Starter 20 / Pro 50 / Business 100) y NO está en prueba
// gratuita, cada expediente extra añade PRECIO_EXPEDIENTE_EXTRA € a su próxima factura Stripe.
// El cobro es best-effort: nunca rompe la creación del expediente.

const uuid = () => crypto.randomUUID();

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { clienteId?: string; nuevo?: { nombre?: string; apellidos?: string; telefono?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  // Workspace del usuario (validado bajo su sesión) — nunca se toma del cliente.
  const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  const admin = createSupabaseAdmin();

  // Cliente: existente (verificado en el workspace) o creado al vuelo.
  let clienteId = body.clienteId?.trim() || "";
  if (!clienteId) {
    const nombre = body.nuevo?.nombre?.trim();
    if (!nombre) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });
    clienteId = uuid();
    const { error } = await admin.from("Cliente").insert({
      id: clienteId, workspaceId, nombre,
      apellidos: body.nuevo?.apellidos?.trim() || null,
      telefono: body.nuevo?.telefono?.trim() || null,
      updatedAt: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: c } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("workspaceId", workspaceId).maybeSingle();
    if (!c) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  // Referencia secuencial del año + inserción, con reintento ante colisión (dos creaciones
  // simultáneas calculan el mismo nº → violación de unicidad → recomputa en vez de 500 crudo).
  const year = new Date().getFullYear();
  const expedienteId = uuid();
  const portalToken = uuid().replace(/-/g, "").slice(0, 10);
  let referencia = "";
  for (let intento = 0; ; intento++) {
    const { data: last } = await admin.from("Expediente").select("referencia").eq("workspaceId", workspaceId).like("referencia", `EXP-${year}-%`).order("referencia", { ascending: false }).limit(1).maybeSingle();
    const n = last ? Number(String(last.referencia).split("-")[2]) + 1 : 1;
    referencia = `EXP-${year}-${String(n).padStart(4, "0")}`;
    const { error: eExp } = await admin.from("Expediente").insert({
      id: expedienteId, workspaceId, clienteId, referencia, portalToken,
      tipo: "OTRO", estado: "BORRADOR", asignadoAId: user.id, updatedAt: new Date().toISOString(),
    });
    if (!eExp) break;
    if (/duplicate|unique|23505/i.test(eExp.message) && intento < 4) continue; // colisión de referencia → reintenta
    return NextResponse.json({ error: eExp.message }, { status: 500 });
  }

  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "CREADO", descripcion: "Expediente creado", userId: user.id },
    { id: uuid(), expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace del portal generado para el cliente", userId: user.id },
  ]);

  // ── Cobro del excedente (best-effort; jamás rompe la creación) ──
  let extra = false;
  try {
    const { data: sub } = await admin
      .from("Subscription")
      .select("plan, estado, modoPrueba, stripeCustomerId")
      .eq("workspaceId", workspaceId)
      .maybeSingle();
    const enPrueba = sub?.estado === "TRIAL" || sub?.modoPrueba === true;
    // Solo se cobra a un despacho con suscripción ACTIVA de pago (no prueba) y Stripe listo.
    if (sub && !enPrueba && sub.estado === "ACTIVA" && sub.stripeCustomerId && stripeDisponible()) {
      // Ventana en UTC (determinista, igual en cliente y servidor sea cual sea la TZ).
      const ahora = new Date();
      const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
      const { count } = await admin.from("Expediente").select("*", { count: "exact", head: true }).eq("workspaceId", workspaceId).gte("createdAt", inicioMes);
      if ((count ?? 0) > limiteExpedientes(sub.plan)) {
        await cobrarExpedienteExtra({ customerId: sub.stripeCustomerId, expedienteId, referencia });
        extra = true;
      }
    }
  } catch (e) {
    // best-effort: nunca rompe la creación. Log estructurado para reconciliar cobros perdidos.
    console.error(`[expediente-overage] cobro extra falló ws=${workspaceId} exp=${expedienteId} ref=${referencia}:`, e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, expedienteId, referencia, portalToken, extra });
}
