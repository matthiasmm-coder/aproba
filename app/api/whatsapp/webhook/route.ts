import { NextResponse, after } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { firmaValida, metaDisponible } from "@/lib/whatsapp-meta";
import { procesarWebhookWhatsApp } from "@/lib/whatsapp-entrante";

export const runtime = "nodejs";
export const maxDuration = 60; // descarga de media + Vision por documento

// WEBHOOK de Meta (WhatsApp Business Platform) — UNA URL para la app de Aproba; el número
// del despacho llega en metadata.phone_number_id y resuelve la cuenta.
//  · GET: verificación del endpoint (hub.mode=subscribe + hub.verify_token → hub.challenge).
//  · POST: firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con el app secret) →
//    200 enseguida y el trabajo en after(); idempotente por wamid (Meta reintenta).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const modo = u.searchParams.get("hub.mode"), token = u.searchParams.get("hub.verify_token"), reto = u.searchParams.get("hub.challenge");
  const esperado = (process.env.META_WEBHOOK_VERIFY_TOKEN ?? "").trim();
  if (modo === "subscribe" && esperado && token === esperado && reto) return new Response(reto, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Verificación rechazada." }, { status: 403 });
}

export async function POST(req: Request) {
  if (!metaDisponible()) return NextResponse.json({ error: "WhatsApp no configurado." }, { status: 503 });
  const raw = await req.text();
  if (!firmaValida(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
  after(async () => {
    try {
      const notas = await procesarWebhookWhatsApp(createSupabaseAdmin(), payload, baseUrl);
      if (notas.length) console.log("[whatsapp webhook]", notas.join(" | "));
    } catch (e) { console.error("[whatsapp webhook] falló:", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ ok: true });
}
