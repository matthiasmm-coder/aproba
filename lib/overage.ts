import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeDisponible, cobrarExpedienteExtra } from "@/lib/billing";
import { limiteExpedientes } from "@/lib/planes";

// Cobro del expediente EXCEDENTE (por encima del límite mensual del plan) — 3 €/expediente.
// Extraído de POST /api/expedientes para compartirlo con "Iniciar renovación" (Vigía):
// una renovación es un expediente normal y cuenta para la cuota como cualquier otro.
// Best-effort: NUNCA lanza (un fallo de cobro no debe romper la creación del expediente).
// Idempotente aguas abajo: cobrarExpedienteExtra usa idempotencyKey `ov_${expedienteId}`.
export async function cobrarOverageSiProcede(
  admin: SupabaseClient,
  opts: { workspaceId: string; expedienteId: string; referencia: string },
): Promise<boolean> {
  try {
    const { data: sub } = await admin
      .from("Subscription")
      .select("plan, estado, modoPrueba, stripeCustomerId")
      .eq("workspaceId", opts.workspaceId)
      .maybeSingle();
    const enPrueba = sub?.estado === "TRIAL" || sub?.modoPrueba === true;
    // Solo se cobra a un despacho con suscripción ACTIVA de pago (no prueba) y Stripe listo.
    if (sub && !enPrueba && sub.estado === "ACTIVA" && sub.stripeCustomerId && stripeDisponible()) {
      // Ventana en UTC (determinista, igual en cliente y servidor sea cual sea la TZ).
      const ahora = new Date();
      const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
      const { count } = await admin
        .from("Expediente")
        .select("*", { count: "exact", head: true })
        .eq("workspaceId", opts.workspaceId)
        .gte("createdAt", inicioMes);
      if ((count ?? 0) > limiteExpedientes(sub.plan)) {
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
