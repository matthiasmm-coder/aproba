import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeDisponible, cobrarExpedienteExtra } from "@/lib/billing";
import { limiteExpedientes } from "@/lib/planes";
import { periodoCuota } from "@/lib/cuota";

// Cobro del expediente EXCEDENTE (por encima del límite mensual del plan) — 3 €/expediente.
// Extraído de POST /api/expedientes para compartirlo con "Iniciar renovación" (Vigía):
// una renovación es un expediente normal y cuenta para la cuota como cualquier otro.
// Best-effort: NUNCA lanza (un fallo de cobro no debe romper la creación del expediente).
// Idempotente aguas abajo: cobrarExpedienteExtra usa idempotencyKey `ov_${expedienteId}`.
//
// La cuota se mide con el contador MONÓTONO UsoMensual (supabase/uso-mensual.sql),
// incrementado aquí porque TODA creación que sobrevive pasa por esta función (las tres
// rutas la llaman justo tras el insert — gestor, renovación de Vigía y solicitud del
// cliente desde su espacio; el delete compensatorio de renovar ocurre antes).
// Borrar un expediente NO baja el contador: crear N → borrar k → crear k ya no esquiva
// el cobro de los k reales. Repli si la migración no está aplicada: count vivo de siempre.
//
// La VENTANA no es el mes natural sino el ciclo de facturación del despacho (lib/cuota):
// la cuota se renueva el día en que paga, no el 1. Por eso la suscripción se lee ANTES
// de incrementar: de ella sale el día ancla del ciclo.
export async function cobrarOverageSiProcede(
  admin: SupabaseClient,
  opts: { workspaceId: string; expedienteId: string; referencia: string },
): Promise<boolean> {
  try {
    const ahora = new Date();
    const { data: sub } = await admin
      .from("Subscription")
      .select("plan, estado, modoPrueba, stripeCustomerId, currentPeriodEnd, trialEndsAt")
      .eq("workspaceId", opts.workspaceId)
      .maybeSingle();
    // Ventana en UTC (determinista, igual en cliente y servidor sea cual sea la TZ).
    const { clave, inicio } = periodoCuota(ahora, sub);
    // El incremento va ANTES del filtro de suscripción: también en prueba gratuita debe
    // contarse la creación, para que la cuota sea exacta si el despacho pasa a pago a
    // mitad de ciclo. null = migración no aplicada (o RPC caído) → repli más abajo.
    let creadosMes: number | null = null;
    try {
      const { data, error } = await admin.rpc("incrementar_uso_mensual", { p_workspace_id: opts.workspaceId, p_mes: clave });
      if (!error && typeof data === "number") creadosMes = data;
    } catch { /* repli al count vivo */ }

    const enPrueba = sub?.estado === "TRIAL" || sub?.modoPrueba === true;
    // Solo se cobra a un despacho con suscripción ACTIVA de pago (no prueba) y Stripe listo.
    if (sub && !enPrueba && sub.estado === "ACTIVA" && sub.stripeCustomerId && stripeDisponible()) {
      if (creadosMes === null) {
        const { count } = await admin
          .from("Expediente")
          .select("*", { count: "exact", head: true })
          .eq("workspaceId", opts.workspaceId)
          .gte("createdAt", inicio.toISOString());
        creadosMes = count ?? 0;
      }
      if (creadosMes > limiteExpedientes(sub.plan)) {
        await cobrarExpedienteExtra({ customerId: sub.stripeCustomerId, expedienteId: opts.expedienteId, referencia: opts.referencia });
        return true;
      }
    }
  } catch (e) {
    // best-effort: nunca rompe la creación. Log estructurado para reconciliar cobros perdidos.
    console.error(
      `[expediente-overage] cobro extra falló ws=${opts.workspaceId} exp=${opts.expedienteId} ref=${opts.referencia}:`,
      e instanceof Error ? e.message : e,
    );
  }
  return false;
}
