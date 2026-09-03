import { NextResponse, after } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { procesarEmailRecibido } from "@/lib/email-entrante-procesar";

export const runtime = "nodejs";
export const maxDuration = 60; // descargar adjuntos + Vision por documento

// Webhook de Resend «email.received» (recepción de documentos por email, 03/09/2026).
// PÚBLICO: la autenticidad se comprueba con la firma Svix del webhook (secreto por
// endpoint, RESEND_WEBHOOK_SECRET). Se responde 200 enseguida y el trabajo pesado corre
// en `after()`; el propio proceso es idempotente por email_id (Resend reintenta).
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !process.env.RESEND_API_KEY) return NextResponse.json({ error: "Recepción no configurada." }, { status: 503 });
  const payload = await req.text();
  let evento: { type?: string; data?: { email_id?: string } };
  try {
    evento = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: { id: req.headers.get("svix-id") ?? "", timestamp: req.headers.get("svix-timestamp") ?? "", signature: req.headers.get("svix-signature") ?? "" },
      webhookSecret: secret,
    }) as typeof evento;
  } catch {
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }
  if (evento.type !== "email.received") return NextResponse.json({ ok: true, ignorado: evento.type ?? "sin tipo" });
  const emailId = evento.data?.email_id;
  if (!emailId) return NextResponse.json({ error: "Sin email_id." }, { status: 400 });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
  after(async () => {
    try {
      const r = await procesarEmailRecibido(createSupabaseAdmin(), { emailId, baseUrl });
      console.log(`[email entrante] ${emailId}: ${r.motivo}`);
    } catch (err) {
      console.error(`[email entrante] ${emailId} falló:`, err instanceof Error ? err.message : err);
    }
  });
  return NextResponse.json({ ok: true });
}
