import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// LOGO del despacho (Ajustes › Despacho y cuenta). Es la marca que ven los CLIENTES: portal,
// emails de aviso, tarjeta del enlace compartido y facturas. Distinto de la foto del
// USUARIO (User.avatarUrl, /api/perfil/avatar, el círculo de la barra lateral).
// Bucket público `avatares`, path logo-<ws>.<ext>, URL en Workspace.logoUrl. Solo admins.

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024;

async function adminWs() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  if (!puedeGestionarEquipo(mem.role as string)) return { error: "Solo un administrador puede cambiar el logo del despacho.", status: 403 as const };
  return { admin, workspaceId: mem.workspaceId as string };
}

export async function POST(req: Request) {
  const r = await adminWs();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });
  const ext = TIPOS[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG o WebP)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El logo supera los 2 MB." }, { status: 400 });

  const path = `logo-${r.workspaceId}.${ext}`;
  const { error: eUp } = await r.admin.storage.from("avatares").upload(path, file, { upsert: true, contentType: file.type });
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });
  const { data: pub } = r.admin.storage.from("avatares").getPublicUrl(path);
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`; // cache-busting (mismo path)
  const { error } = await r.admin.from("Workspace").update({ logoUrl }).eq("id", r.workspaceId);
  if (error) {
    const falta = /logoUrl|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración del logo (supabase/workspace-logo.sql)." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, logoUrl });
}

export async function DELETE() {
  const r = await adminWs();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { data: fila } = await r.admin.from("Workspace").select("logoUrl").eq("id", r.workspaceId).maybeSingle();
  const url = (fila as { logoUrl?: string | null } | null)?.logoUrl ?? "";
  const m = /\/avatares\/([^?]+)/.exec(url);
  if (m) { try { await r.admin.storage.from("avatares").remove([decodeURIComponent(m[1])]); } catch { /* best-effort */ } }
  const { error } = await r.admin.from("Workspace").update({ logoUrl: null }).eq("id", r.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
