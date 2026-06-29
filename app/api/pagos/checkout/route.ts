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
  const aviso = (m: string) => NextResponse.redirect(`${origin}/pagar/cancelado?m=${m}`, 303);
  if (!facturaId) return aviso("falta");

  const admin = createSupabaseAdmin();
  const { data: f } = await admin
    .from("Factura")
    .select("id, workspaceId, numero, concepto, total, estado")
    .eq("id", facturaId)
    .maybeSingle();
  if (!f) return aviso("nofactura");
  if (f.estado === "PAGADA") return NextResponse.redirect(`${origin}/pagar/exito?f=${facturaId}`, 303);

  const key = await fetchStripeKeyDeWorkspace(admin, f.workspaceId as string);
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
