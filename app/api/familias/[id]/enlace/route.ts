import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST → devuelve (creándolo si hace falta) el enlace de portal de la familia. Solo el
// gestor autenticado; la familia se valida bajo sesión/RLS antes de tocar admin. El token
// es la credencial del portal familiar (mismo modelo que Expediente.portalToken).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: fam, error } = await supabase.from("Familia").select("id, portalToken").eq("id", id).maybeSingle();
  if (error && /portalToken|column|schema cache|does not exist/i.test(error.message)) {
    return NextResponse.json({ error: "Falta la migración: ejecuta supabase/familia-portal.sql." }, { status: 500 });
  }
  if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });

  let token = fam.portalToken as string | null;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const admin = createSupabaseAdmin();
    const { error: eUpd } = await admin.from("Familia").update({ portalToken: token, updatedAt: new Date().toISOString() }).eq("id", id);
    if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token });
}
