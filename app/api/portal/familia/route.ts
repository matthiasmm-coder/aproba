import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// Portal de un expediente FAMILIAR (/j/[token] con familiaId): el titular añade/rellena la
// ficha de cada miembro y designa el solicitante. El token del expediente es la credencial;
// se resuelve la Familia por Expediente.familiaId y se verifica que cada miembro pertenece
// a ESA familia (anti-IDOR). No hay sesión.
async function resolverExpediente(token: string) {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("Expediente").select("id, familiaId, workspaceId, clienteId").eq("portalToken", token).maybeSingle();
  return { admin, exp: data as { id: string; familiaId: string | null; workspaceId: string; clienteId: string } | null };
}

// POST → añade un miembro (Cliente vacío) a la familia. Devuelve su id.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; parentesco?: string };
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Falta el enlace." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  if (!exp.familiaId) return NextResponse.json({ error: "Este expediente no es familiar." }, { status: 400 });

  // Límite razonable de miembros por familia (evita abuso: creación ilimitada de Cliente).
  const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", exp.familiaId);
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Demasiados miembros en la familia." }, { status: 400 });

  const id = uuid();
  const { error } = await admin.from("Cliente").insert({
    id, workspaceId: exp.workspaceId, familiaId: exp.familiaId,
    nombre: "", parentesco: (body.parentesco ?? "OTRO").trim() || "OTRO",
    updatedAt: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}

// PUT → guarda la ficha + parentesco de un miembro. esSolicitante=true → el trámite es para
// ese miembro (Expediente.clienteId = él).
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; clienteId?: string; ficha?: ClienteFicha; parentesco?: string; esSolicitante?: boolean; idioma?: string };
  const token = (body.token ?? "").trim();
  const clienteId = (body.clienteId ?? "").trim();
  if (!token || !clienteId) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp?.familiaId) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  // El miembro debe pertenecer a la familia del expediente.
  const { data: cli } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

  const ficha = body.ficha ?? {};
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) { const v = (ficha as Record<string, unknown>)[k]; if (typeof v === "string") patch[k] = v.trim(); }
  if (typeof body.parentesco === "string" && body.parentesco.trim()) patch.parentesco = body.parentesco.trim();
  if (typeof body.idioma === "string" && ["es", "en", "fr", "it", "de"].includes(body.idioma)) patch.idioma = body.idioma;
  patch.updatedAt = new Date().toISOString();
  const { error } = await admin.from("Cliente").update(patch).eq("id", clienteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Designación del solicitante: el expediente se ancla a ese miembro.
  if (body.esSolicitante) await admin.from("Expediente").update({ clienteId }).eq("id", exp.id);

  return NextResponse.json({ ok: true });
}

// DELETE → quita un miembro de la familia. No se puede borrar al solicitante actual.
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; clienteId?: string };
  const token = (body.token ?? "").trim();
  const clienteId = (body.clienteId ?? "").trim();
  if (!token || !clienteId) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp?.familiaId) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  if (clienteId === exp.clienteId) return NextResponse.json({ error: "No puedes quitar al solicitante. Designa otro antes." }, { status: 400 });

  const { data: cli } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

  // El miembro no puede ser el solicitante de NINGÚN expediente: la FK Expediente.cliente es
  // ON DELETE CASCADE, así que borrar su Cliente cascada-borraría ese expediente y sus
  // documentos/facturas. Una familia puede tener varios expedientes (familiaId no es único).
  const { data: anchor } = await admin.from("Expediente").select("id").eq("clienteId", clienteId).limit(1).maybeSingle();
  if (anchor) return NextResponse.json({ error: "Ese miembro es el solicitante de un expediente. Designa a otro antes de quitarlo." }, { status: 400 });

  const { error } = await admin.from("Cliente").delete().eq("id", clienteId).eq("familiaId", exp.familiaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
