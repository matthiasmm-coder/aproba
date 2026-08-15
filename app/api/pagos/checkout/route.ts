import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchStripeKeyDeWorkspace, stripeConClave } from "@/lib/cobros-tarjeta";
import { baseUrlFromRequest } from "@/lib/base-url";

// El cliente abre este enlace desde su email («Pagar con tarjeta») → creamos una
// sesión de Stripe Checkout en la cuenta de SU gestoría por el importe exacto de la
// factura y le redirigimos a la página de pago hospedada por Stripe.
// Es GET (es un enlace <a>); el id de factura es un uuid no adivinable.

export async function GET(req: Request) {
  const origin = baseUrlFromRequest(req);
  const facturaId = new URL(req.url).searchParams.get("f")?.trim() ?? "";
  // Conserva ?f=: la página de cancelación solo puede ofrecer el plan B (virement,
  // reintento) si sabe QUÉ factura es — justo cuando la tarjeta falla hace más falta.
  const aviso = (m: string) => NextResponse.redirect(`${origin}/pagar/cancelado?m=${m}${facturaId ? `&f=${facturaId}` : ""}`, 303);
  if (!facturaId) return aviso("falta");

  const admin = createSupabaseAdmin();
  // oficinaId puede no estar migrada (supabase/oficinas-facturacion.sql) → repli.
  let fRes = await admin.from("Factura")
    .select("id, workspaceId, numero, concepto, total, estado, expedienteId, oficinaId")
    .eq("id", facturaId).maybeSingle();
  if (fRes.error) fRes = await admin.from("Factura")
    .select("id, workspaceId, numero, concepto, total, estado, expedienteId")
    .eq("id", facturaId).maybeSingle();
  if (fRes.error) fRes = await admin.from("Factura")
    .select("id, workspaceId, numero, concepto, total, estado")
    .eq("id", facturaId).maybeSingle();
  const f = fRes.data;
  if (!f) return aviso("nofactura");
  if (f.estado === "PAGADA") return NextResponse.redirect(`${origin}/pagar/exito?f=${facturaId}`, 303);
  // Una factura anulada no debe poder cobrarse desde un enlace antiguo que siga en el
  // correo del cliente (auditoría 06/08 — guarda lista ANTES de que exista «anular»).
  if (f.estado === "ANULADA") return aviso("anulada");

  // multi-oficina: el dinero debe entrar en la cuenta Stripe de la EMPRESA que emitió
  // la factura. Se resuelve por su sede (estampada o vía expediente), con cascada a la común.
  const { oficinaDeFacturaFila } = await import("@/lib/facturacion-oficina");
  const sedeF = await oficinaDeFacturaFila(admin, f as { oficinaId?: string | null; expedienteId?: string | null });
  const key = await fetchStripeKeyDeWorkspace(admin, f.workspaceId as string, sedeF);
  if (!key) return aviso("sintarjeta"); // la gestoría no tiene el cobro con tarjeta activado

  try {
    const session = await stripeConClave(key).checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(Number(f.total) * 100),
          product_data: { name: `Factura ${f.numero}`, description: String(f.concepto).slice(0, 250) },
        },
      }],
      metadata: { facturaId: String(f.id), numero: String(f.numero) },
      success_url: `${origin}/pagar/exito?f=${facturaId}&s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pagar/cancelado?f=${facturaId}`,
    });
    if (!session.url) return aviso("stripe");
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error("[pagos/checkout]", e instanceof Error ? e.message : e);
    return aviso("stripe");
  }
}
