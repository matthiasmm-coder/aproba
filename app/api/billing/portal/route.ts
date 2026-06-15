import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, stripeDisponible } from "@/lib/billing";
import { baseUrlFromRequest } from "@/lib/base-url";
import { puedeGestionarEquipo } from "@/lib/planes";

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Portail client Stripe : moyen de paiement, facturas, anulación.
export async function POST(req: Request) {
  if (!stripeDisponible()) return fail("La facturación todavía no está configurada en este entorno.", 503);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin
    .from("Membership")
    .select("workspaceId, role")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return fail("No perteneces a ningún despacho.", 403);
  if (!puedeGestionarEquipo(mem.role as string)) return fail("Solo un administrador puede gestionar la facturación.", 403);

  const { data: sub } = await admin.from("Subscription").select("*").eq("workspaceId", mem.workspaceId as string).maybeSingle();
  if (!sub?.stripeCustomerId) return fail("Este despacho todavía no tiene facturación activada.", 409);

  const origin = baseUrlFromRequest(req);
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId as string,
      return_url: `${origin}/app/ajustes`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Customer d'un autre mode Stripe (live↔test) ou supprimé → message actionnable
    // au lieu d'un 500 opaque (sinon « Gestionar facturación » casse sans explication).
    const err = e as { code?: string; message?: string };
    if (err?.code === "resource_missing") {
      return fail("Tu facturación se creó en otro entorno de Stripe. Vuelve a añadir la tarjeta para regenerarla.", 409);
    }
    console.error("[billing/portal]", err?.message ?? e);
    return fail(`No se pudo abrir la facturación: ${err?.message ?? "error de Stripe"}`, 502);
  }
}
