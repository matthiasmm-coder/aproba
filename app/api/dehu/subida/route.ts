import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_PDF_BYTES, MAX_ZIP_BYTES } from "@/lib/notificaciones-dehu";
import { BUCKET_ENTRADA, ERROR_MIGRACION_DEHU } from "@/lib/notificaciones-dehu-guardar";

export const runtime = "nodejs";

// DEHú · paso 1 de la importación: URL firmada para subir el archivo (PDF, foto o ZIP)
// DIRECTAMENTE al bucket privado de entrada. Así un ZIP de la DEHú no choca con el límite
// de cuerpo de las funciones (4,5 MB) ni con el bucket «documentos» (solo PDF e imágenes),
// y la lectura IA va archivo a archivo en /api/dehu/importar.

const EXT = new Set(["pdf", "zip", "jpg", "jpeg", "png", "webp"]);

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  let body: { nombre?: string; size?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });

  const nombre = String(body.nombre ?? "");
  const ext = /\.([a-z0-9]{2,5})$/i.exec(nombre)?.[1]?.toLowerCase() ?? "";
  if (!EXT.has(ext)) return NextResponse.json({ error: `${nombre || "Archivo"}: formato no admitido (PDF, ZIP, JPG, PNG o WebP).` }, { status: 400 });
  const size = Number(body.size ?? 0);
  const max = ext === "zip" ? MAX_ZIP_BYTES : MAX_PDF_BYTES;
  if (!Number.isFinite(size) || size <= 0 || size > max) return NextResponse.json({ error: `${nombre}: supera los ${Math.round(max / 1024 / 1024)} MB.` }, { status: 400 });

  const path = `${mem.workspaceId as string}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { data, error } = await admin.storage.from(BUCKET_ENTRADA).createSignedUploadUrl(path);
  if (error || !data) {
    const sinBucket = /not found|bucket/i.test(error?.message ?? "");
    return NextResponse.json({ error: sinBucket ? ERROR_MIGRACION_DEHU : "No se pudo preparar la subida." }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
