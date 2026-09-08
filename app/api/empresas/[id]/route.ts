import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizaNif } from "@/lib/empresa";

// Editar los datos de una EMPRESA cliente (razón social, CIF, domicilio fiscal, contacto).
// Bajo RLS (empresa_tenant): una empresa de otro despacho «no existe». Las facturas ya
// emitidas conservan su snapshot (clienteDatos): cambiar aquí solo afecta a lo futuro.

const CAMPOS = ["razonSocial", "nif", "domicilio", "codigoPostal", "municipio", "provincia", "contactoNombre", "contactoEmail", "contactoTelefono"] as const;
type Campo = (typeof CAMPOS)[number];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Partial<Record<Campo, unknown>>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: emp } = await supa.from("Empresa").select("id").eq("id", id).maybeSingle();
  if (!emp) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const patch: Record<string, string | null> = {};
  for (const k of CAMPOS) {
    if (!(k in body)) continue;
    const v = String(body[k] ?? "").trim();
    if (k === "razonSocial") {
      if (!v) return NextResponse.json({ error: "La razón social es obligatoria." }, { status: 400 });
      patch[k] = v.slice(0, 200);
    } else if (k === "nif") patch[k] = normalizaNif(v) || null;
    else patch[k] = v.slice(0, 300) || null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada que guardar." }, { status: 400 });
  patch.updatedAt = new Date().toISOString();

  const { data, error } = await supa.from("Empresa").update(patch).eq("id", id)
    .select("id, razonSocial, nif, domicilio, codigoPostal, municipio, provincia, contactoNombre, contactoEmail, contactoTelefono").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
