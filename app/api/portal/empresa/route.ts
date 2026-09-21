import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizaNif } from "@/lib/empresa";

export const runtime = "nodejs";

// Portal de un expediente DE EMPRESA: la empresa completa sus datos fiscales y de contacto
// (los que llevan la hoja de encargo y las facturas). Token del expediente = credencial;
// solo toca la Empresa de ESE expediente. No hay sesión.
const CAMPOS = ["razonSocial", "nif", "domicilio", "codigoPostal", "municipio", "provincia", "contactoNombre", "contactoEmail", "contactoTelefono"] as const;

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; empresa?: Record<string, unknown> };
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Falta el enlace." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("Expediente").select("id, workspaceId, clienteId, empresaId").eq("portalToken", token).maybeSingle();
  const exp = data as { id: string; workspaceId: string; clienteId: string | null; empresaId: string | null } | null;
  if (!exp?.empresaId || exp.clienteId) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  const patch: Record<string, string | null> = {};
  for (const k of CAMPOS) {
    const v = body.empresa?.[k];
    if (typeof v !== "string") continue;
    const limpio = k === "nif" ? normalizaNif(v) : v.trim().slice(0, 200);
    patch[k] = limpio || null;
  }
  if (patch.razonSocial === null) delete patch.razonSocial; // la razón social nunca se vacía
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  patch.updatedAt = new Date().toISOString();
  const { error } = await admin.from("Empresa").update(patch).eq("id", exp.empresaId).eq("workspaceId", exp.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
