import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchStripeKeyDeWorkspace, stripeConClave, marcarFacturaPagada } from "@/lib/cobros-tarjeta";
import { enviarConfirmacionPago } from "@/lib/notificaciones";

// Cron de Vercel (ver vercel.json): reconcilia los pagos con TARJETA que el redirect a
// /pagar/exito no llegó a confirmar (cliente cerró la pestaña, perdió la red…). Sin esto,
// una factura pagada en Stripe puede quedarse en EMITIDA para siempre.
//
// Cómo: por cada workspace con StripeCuenta activa Y facturas pendientes, lista las
// sesiones de Checkout recientes de SU cuenta Stripe y casa metadata.facturaId (que
// /api/pagos/checkout pone desde siempre) con las facturas EMITIDA/VENCIDA. Si la sesión
// está pagada Y el importe coincide con el total ACTUAL de la factura → marcarFacturaPagada
// (atómica) + confirmación al cliente (solo en la transición real).
//
// Además ALERTA al gestor (evento en el historial, idempotente) cuando:
//  - el importe pagado ≠ total de la factura (p. ej. factura editada tras enviar el enlace);
//  - hay ≥2 sesiones pagadas para la misma factura (posible doble cobro → reembolsar en Stripe).
//
// Reconciliación por polling: no requiere registrar un webhook por cada cuenta Stripe de
// gestoría ni ninguna migración.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAS_VENTANA = 30; // sesiones más viejas ya expiran en Stripe (24 h); margen amplio
const MAX_PAGINAS = 5; // tope de páginas de 100 sesiones por workspace (backstop)

// FAIL-CLOSED: este cron toca dinero → sin CRON_SECRET configurada no corre (a diferencia
// de veille-ex). Vercel Cron añade `Authorization: Bearer <CRON_SECRET>` automáticamente.
// Solo header (nada de ?key=: las URLs acaban en logs).
function autorizado(req: Request): "ok" | "sin-secret" | "no" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "sin-secret";
  return req.headers.get("authorization") === `Bearer ${secret}` ? "ok" : "no";
}

// Evento de alerta en el historial del expediente de la factura, UNA sola vez por marcador
// (los crons se repiten a diario; sin idempotencia, spam). Sin expediente → solo log.
async function alertar(admin: SupabaseClient, facturaId: string, marcador: string, texto: string) {
  const { data: fac } = await admin.from("Factura").select("expedienteId").eq("id", facturaId).maybeSingle();
  if (!fac?.expedienteId) {
    console.error(`[reconciliar-pagos] ${texto} (factura ${facturaId} sin expediente)`);
    return;
  }
  const { data: previo } = await admin
    .from("ExpedienteEvento")
    .select("id")
    .eq("expedienteId", fac.expedienteId)
    .like("descripcion", `%${marcador}%`)
    .limit(1)
    .maybeSingle();
  if (previo) return;
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: fac.expedienteId,
    tipo: "COMENTARIO",
    descripcion: `⚠️ ${texto} [${marcador}]`,
  });
}

export async function GET(req: Request) {
  const auth = autorizado(req);
  if (auth === "sin-secret") return NextResponse.json({ error: "CRON_SECRET no configurada — cron desactivado (fail-closed)." }, { status: 503 });
  if (auth === "no") return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  // Respuesta MINIMALISTA (contadores): nada de ids de workspace/factura en el JSON.
  const resumen = { workspaces: 0, pendientes: 0, reconciliadas: 0, alertas: 0, errores: 0 };

  // Workspaces con cobro con tarjeta activado. Si la tabla no está migrada → nada que hacer.
  let cuentas: { workspaceId: string }[] = [];
  try {
    const { data } = await admin.from("StripeCuenta").select("workspaceId").eq("activa", true);
    cuentas = (data ?? []) as { workspaceId: string }[];
  } catch {
    return NextResponse.json({ ...resumen, nota: "StripeCuenta sin migrar" });
  }

  const desde = Math.floor(Date.now() / 1000) - DIAS_VENTANA * 24 * 3600;

  for (const { workspaceId } of cuentas) {
    // Facturas aún cobrables del workspace; sin pendientes no hay nada que reconciliar.
    const { data: pendRows } = await admin
      .from("Factura")
      .select("id, numero, total")
      .eq("workspaceId", workspaceId)
      .in("estado", ["EMITIDA", "VENCIDA"]);
    const pendientes = new Map(
      ((pendRows ?? []) as { id: string; numero: string; total: number | string }[]).map((r) => [String(r.id), r]),
    );
    if (!pendientes.size) continue;

    const key = await fetchStripeKeyDeWorkspace(admin, workspaceId);
    if (!key) continue;

    resumen.workspaces += 1;
    resumen.pendientes += pendientes.size;

    try {
      const stripe = stripeConClave(key);
      const pagosPorFactura = new Map<string, number>(); // detección de doble cobro
      let startingAfter: string | undefined;
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const lote = await stripe.checkout.sessions.list({
          limit: 100,
          created: { gte: desde },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        for (const sess of lote.data) {
          const facturaId = sess.metadata?.facturaId;
          if (!facturaId || sess.payment_status !== "paid") continue;
          // Cuenta TODAS las sesiones pagadas (también de facturas ya PAGADA en runs
          // anteriores): ≥2 = posible doble cobro.
          pagosPorFactura.set(facturaId, (pagosPorFactura.get(facturaId) ?? 0) + 1);

          const f = pendientes.get(facturaId);
          if (!f) continue;

          // El importe pagado debe coincidir con el total ACTUAL de la factura: una
          // sesión vieja (≤24 h) puede llevar un importe anterior a una corrección.
          const centimos = Math.round(Number(f.total) * 100);
          if (sess.amount_total !== centimos || sess.currency !== "eur") {
            await alertar(
              admin,
              facturaId,
              `importe-distinto ${f.numero}`,
              `Pago Stripe con importe distinto al de la factura ${f.numero}: pagado ${((sess.amount_total ?? 0) / 100).toFixed(2)} ${String(sess.currency).toUpperCase()} vs total ${Number(f.total).toFixed(2)} EUR. NO se ha marcado como pagada — revísalo en Stripe.`,
            );
            resumen.alertas += 1;
            pendientes.delete(facturaId); // no reintentar con otra sesión este run
            continue;
          }

          const r = await marcarFacturaPagada(admin, facturaId, "TARJETA");
          pendientes.delete(facturaId);
          if (r !== "nuevo") continue;
          resumen.reconciliadas += 1;
          // Confirmación al cliente, como en /pagar/exito (solo en la transición real).
          const { data: fac } = await admin.from("Factura").select("expedienteId").eq("id", facturaId).maybeSingle();
          if (fac?.expedienteId) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
            await enviarConfirmacionPago(admin, {
              expedienteId: String(fac.expedienteId),
              numero: String(f.numero),
              total: Number(f.total),
              metodo: "TARJETA",
              baseUrl,
            });
          }
        }
        if (!lote.has_more || !lote.data.length) break;
        startingAfter = lote.data[lote.data.length - 1].id;
      }

      // Posibles dobles cobros: 2+ sesiones pagadas para la misma factura. El cliente pagó
      // dos veces (dos pestañas/aparatos) — el gestor debe reembolsar una en Stripe.
      for (const [facturaId, n] of pagosPorFactura) {
        if (n < 2) continue;
        await alertar(
          admin,
          facturaId,
          `posible-doble-pago ${facturaId.slice(0, 8)}`,
          `Posible DOBLE PAGO con tarjeta: ${n} sesiones de Stripe pagadas para la misma factura. Revisa tu panel de Stripe y reembolsa el cobro duplicado.`,
        );
        resumen.alertas += 1;
      }
    } catch (e) {
      // Clave restringida sin permiso de lectura de Checkout, red caída… → siguiente workspace.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[reconciliar-pagos] workspace ${workspaceId}:`, msg);
      resumen.errores += 1;
    }
  }

  return NextResponse.json(resumen);
}
