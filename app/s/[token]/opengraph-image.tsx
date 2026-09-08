import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { marcaPorPortalToken } from "@/lib/marca";
import { tarjetaPortal, OG_SIZE } from "@/lib/og-portal";
import { TEXTOS_PORTAL } from "@/lib/portal-metadata";

// Tarjeta del enlace al compartirlo (WhatsApp, email…): marca del DESPACHO, no de Aproba.
export const runtime = "nodejs";
export const alt = TEXTOS_PORTAL.s.titulo;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const marca = await marcaPorPortalToken(createSupabaseAdmin(), token).catch(() => null);
  try {
    return await tarjetaPortal(marca, TEXTOS_PORTAL.s.titulo);
  } catch (err) {
    // Sin tarjeta no se rompe nada (el enlace sigue funcionando): se deja el motivo legible.
    console.error("[og portal]", err instanceof Error ? err.message : err);
    return new Response(`og: ${err instanceof Error ? err.message : "error"}`, { status: 500, headers: { "content-type": "text/plain" } });
  }
}
