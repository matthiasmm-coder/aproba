import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { procesarSubidaDocumento } from "@/lib/documentos-upload";
import { trabajadorPorToken } from "@/lib/trabajador-token";
import { baseUrlFromRequest } from "@/lib/base-url";

// Subida de un documento desde el ENLACE INDIVIDUAL del trabajador (/t/<token>). El
// documento queda a SU nombre (clienteId = el trabajador) dentro del expediente de su
// empresa. Mismos límites que el portal; token del trabajador = credencial, sin sesión.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  const label = String(form?.get("label") ?? "").trim();
  const file = form?.get("file");
  if (!token || !label || !(file instanceof File)) return NextResponse.json({ error: "token, label y file requeridos" }, { status: 400 });
  const ext = TIPOS_OK[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG, WebP o PDF)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const tr = await trabajadorPorToken(admin, token);
  if (!tr) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const r = await procesarSubidaDocumento(admin, {
      exp: { id: tr.exp.id, workspaceId: tr.exp.workspaceId, clienteId: tr.exp.clienteId, tipo: tr.exp.tipo, estado: tr.exp.estado, familiaId: null, oficinaId: tr.exp.oficinaId },
      label, clienteId: tr.clienteId, file, buffer, ext, baseUrl: baseUrlFromRequest(req), origen: "cliente", auto: false,
    });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo guardar el documento." }, { status: 500 });
  }
}
