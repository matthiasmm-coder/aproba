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
