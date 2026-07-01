import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

export const runtime = "nodejs";

// El titular rellena la ficha de UN miembro desde el portal familiar (/f/[token]).
// El token de la FAMILIA es la credencial; se verifica que el cliente pertenece a esa
// familia antes de escribir (anti-IDOR, mismo patrón que /api/portal/datos).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: { clienteId?: string; ficha?: ClienteFicha; idioma?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const clienteId = (body.clienteId ?? "").trim();
  if (!token || !clienteId) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: fam } = await admin.from("Familia").select("id").eq("portalToken", token).maybeSingle();
  if (!fam) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  // El cliente debe pertenecer a ESTA familia (si no, el token no autoriza a editarlo).
  const { data: cli } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", fam.id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

  const ficha = body.ficha ?? {};
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) {
    const v = (ficha as Record<string, unknown>)[k];
    if (typeof v === "string") patch[k] = v.trim();
  }
  if (typeof body.idioma === "string" && ["es", "en", "fr", "it", "de"].includes(body.idioma)) patch.idioma = body.idioma;
  patch.updatedAt = new Date().toISOString();

  const { error } = await admin.from("Cliente").update(patch).eq("id", clienteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
