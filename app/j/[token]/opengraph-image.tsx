import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { marcaPorPortalToken } from "@/lib/marca";
import { tarjetaPortal, OG_SIZE } from "@/lib/og-portal";
import { TEXTOS_PORTAL } from "@/lib/portal-metadata";

// Tarjeta del enlace al compartirlo (WhatsApp, email…): marca del DESPACHO, no de Aproba.
export const runtime = "nodejs";
export const alt = TEXTOS_PORTAL.j.titulo;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const marca = await marcaPorPortalToken(createSupabaseAdmin(), token).catch(() => null);
  return tarjetaPortal(marca, TEXTOS_PORTAL.j.titulo);
}
