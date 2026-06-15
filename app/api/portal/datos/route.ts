import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// Le client enregistre sa ficha depuis le portail (/j/[token]). On résout
// l'expediente par son token, puis on met à jour le Cliente rattaché.
export async function POST(req: Request) {
  let body: { token?: string; ficha?: ClienteFicha; idioma?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Falta el enlace." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("clienteId").eq("portalToken", token).maybeSingle();
  if (!exp?.clienteId) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  // On ne garde que les clés connues de la ficha (jamais d'écriture arbitraire).
  const ficha = body.ficha ?? {};
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) {
    const v = (ficha as Record<string, unknown>)[k];
    if (typeof v === "string") patch[k] = v.trim();
  }
  // Langue choisie par le client (pour les notifications + la page de suivi).
  if (typeof body.idioma === "string" && ["es", "en", "fr", "it", "de"].includes(body.idioma)) patch.idioma = body.idioma;
  // nombre/apellidos alimentent aussi les colonnes principales du Cliente.
  patch.updatedAt = new Date().toISOString();

  const { error } = await admin.from("Cliente").update(patch).eq("id", exp.clienteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
