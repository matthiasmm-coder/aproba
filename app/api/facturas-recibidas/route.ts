import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { guardarFacturaRecibida } from "@/lib/facturas-recibidas-guardar";
import { MAX_ARCHIVO_RECIBIDA, MAX_SUBIDA_RECIBIDAS, MIMES_RECIBIDA } from "@/lib/facturas-recibidas";

export const runtime = "nodejs";
export const maxDuration = 60; // una lectura IA por archivo

// FACTURAS RECIBIDAS — POST multipart (file[], oficinaId?) → cada archivo se guarda en el
// bucket privado, la IA lee proveedor/fecha/importes y se crea la fila. Cualquier miembro
// del despacho puede subir (misma visibilidad que las facturas emitidas).

const MIME_POR_EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Elige al menos un archivo (PDF, JPG, PNG o WebP)." }, { status: 400 });
  if (files.length > MAX_SUBIDA_RECIBIDAS) return NextResponse.json({ error: `Máximo ${MAX_SUBIDA_RECIBIDAS} archivos por subida.` }, { status: 400 });

  // Oficina: solo si pertenece al despacho (anti-IDOR).
  let oficinaId: string | null = null;
  const ofi = String(form.get("oficinaId") ?? "").trim();
  if (ofi) {
    const { data: o } = await admin.from("Oficina").select("id").eq("id", ofi).eq("workspaceId", workspaceId).maybeSingle();
    if (o) oficinaId = o.id as string;
  }

  const facturas = []; const avisos: string[] = [];
  for (const f of files) {
    const ext = /\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1]?.toLowerCase() ?? "";
    const mime = MIMES_RECIBIDA.has(f.type) ? f.type : (MIME_POR_EXT[ext] ?? "");
    if (!mime) { avisos.push(`${f.name}: formato no admitido (PDF, JPG, PNG o WebP)`); continue; }
    if (f.size > MAX_ARCHIVO_RECIBIDA) { avisos.push(`${f.name}: supera los 8 MB`); continue; }
    try {
      const r = await guardarFacturaRecibida(admin, { workspaceId, oficinaId, buffer: Buffer.from(await f.arrayBuffer()), mime, nombre: f.name, origen: "MANUAL", creadoPorId: user.id, forzar: true });
      if (r.fila) { facturas.push(r.fila); if (r.leida.avisos.length) avisos.push(`${f.name}: ${r.leida.avisos.join(", ")}`); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      if (/migración/.test(msg)) return NextResponse.json({ error: msg }, { status: 500 });
      avisos.push(`${f.name}: ${msg}`);
    }
  }
  return NextResponse.json({ ok: true, facturas, avisos });
}
