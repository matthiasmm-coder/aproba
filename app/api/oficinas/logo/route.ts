import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// Logo de facturación de UNA oficina. Mismo circuito que el logo del despacho
// (bucket público `avatares`), con path propio por sede. FormData: oficinaId +
// logo (file) o quitarLogo=1. Solo administradores; la oficina se valida contra
// MI workspace (anti-IDOR).

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  if (!puedeGestionarEquipo(mem.role as string)) return NextResponse.json({ error: "Solo un administrador puede cambiar el logo." }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const oficinaId = String(form.get("oficinaId") ?? "").trim();
  const { data: ofi } = await admin.from("Oficina").select("id").eq("id", oficinaId).eq("workspaceId", mem.workspaceId as string).maybeSingle();
  if (!ofi) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });

  let logoUrl: string | null | undefined;
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = TIPOS[file.type];
    if (!ext) return NextResponse.json({ error: "Logo no soportado (JPG, PNG o WebP)." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "El logo supera los 2 MB." }, { status: 400 });
    const path = `logo-ofi-${oficinaId}.${ext}`;
    const { error: eUp } = await admin.storage.from("avatares").upload(path, file, { upsert: true, contentType: file.type });
    if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });
    const { data: pub } = admin.storage.from("avatares").getPublicUrl(path);
    logoUrl = `${pub.publicUrl}?v=${Date.now()}`;
  } else if (String(form.get("quitarLogo") ?? "") === "1") {
    logoUrl = null;
  } else {
    return NextResponse.json({ error: "Falta el logo." }, { status: 400 });
  }

  const { error } = await admin.from("Oficina").update({ logoUrl, updatedAt: new Date().toISOString() }).eq("id", oficinaId);
  if (error) {
    const falta = /logoUrl|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/oficina-inicial.sql." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, logoUrl: logoUrl ?? null });
}
