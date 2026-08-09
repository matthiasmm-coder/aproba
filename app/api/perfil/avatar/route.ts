import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Photo de profil : l'utilisateur connecté uploade son image → bucket public
// `avatares` (via service_role) → URL enregistrée dans User.avatarUrl.

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo (limite du bucket)

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  const ext = TIPOS[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG o WebP)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen supera los 2 MB" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const path = `${user.id}.${ext}`;
  const { error: e1 } = await admin.storage.from("avatares").upload(path, file, { upsert: true, contentType: file.type });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { data: pub } = admin.storage.from("avatares").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-busting (upsert même chemin)
  const { error: e2 } = await admin.from("User").update({ avatarUrl: url }).eq("id", user.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true, url });
}

// Quitar la foto: se borra el objeto del bucket y se limpia User.avatarUrl (se vuelve
// a las iniciales). La ruta del fichero se deduce de la URL guardada — el nombre es
// siempre `<userId>.<ext>`, pero la extensión depende de lo que subió.
export async function DELETE() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: fila } = await admin.from("User").select("avatarUrl").eq("id", user.id).maybeSingle();
  const url = (fila as { avatarUrl?: string | null } | null)?.avatarUrl ?? "";
  const m = /\/avatares\/([^?]+)/.exec(url);
  if (m) {
    // Best-effort: si el borrado en Storage falla, la ficha queda igualmente sin foto.
    try { await admin.storage.from("avatares").remove([decodeURIComponent(m[1])]); } catch { /* nada */ }
  }
  const { error } = await admin.from("User").update({ avatarUrl: null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
