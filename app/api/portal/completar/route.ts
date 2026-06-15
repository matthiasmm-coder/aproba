import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarSeguimiento } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// Fin du parcours SANS paiement (le client a envoyé ses documents). Envoie le
// lien de suivi (email + WhatsApp). Pour les parcours avec paiement, c'est
// /api/pagos qui déclenche la notification.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Falta el enlace." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("id").eq("portalToken", token).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  await enviarSeguimiento(admin, { expedienteId: exp.id, baseUrl: baseUrlFromRequest(req) });
  return NextResponse.json({ ok: true });
}
