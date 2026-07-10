import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PARENTESCO_LABEL } from "@/lib/familia";

// Gestión de los MIEMBROS de una familia desde el panel del GESTOR (pedido por Juan:
// su expediente familiar solo generaba los formularios del esposo porque la esposa no
// estaba registrada como solicitante — y eso solo podía marcarse desde el portal del
// cliente). Espejo de /api/portal/familia con sesión en lugar de token: la Familia se
// resuelve BAJO RLS (anti-IDOR) y se escribe con service_role.

const uuid = () => crypto.randomUUID();
const MAX_MIEMBROS = 20;

async function resolverFamilia(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: fam } = await supa.from("Familia").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!fam) return { error: NextResponse.json({ error: "Familia no encontrada." }, { status: 404 }) };
  return { fam: fam as { id: string; workspaceId: string }, admin: createSupabaseAdmin() };
}

const parentescoValido = (p: string) => p in PARENTESCO_LABEL;

// POST → añade un miembro. A diferencia del portal (ficha vacía que rellena el cliente),
// el gestor da al menos el nombre. esSolicitante opcional desde el alta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { nombre?: string; apellidos?: string; parentesco?: string; esSolicitante?: boolean };
  const nombre = (body.nombre ?? "").trim();
  const parentesco = (body.parentesco ?? "OTRO").trim() || "OTRO";
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  if (!parentescoValido(parentesco)) return NextResponse.json({ error: "Parentesco no válido." }, { status: 400 });

  const r = await resolverFamilia(id);
  if ("error" in r) return r.error;

  const { count } = await r.admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", id);
  if ((count ?? 0) >= MAX_MIEMBROS) return NextResponse.json({ error: "Demasiados miembros en la familia." }, { status: 400 });

  const miembroId = uuid();
  const { error } = await r.admin.from("Cliente").insert({
    id: miembroId, workspaceId: r.fam.workspaceId, familiaId: id,
    nombre, apellidos: (body.apellidos ?? "").trim() || null, parentesco,
    updatedAt: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Solicitante en update aparte (columna de migración cliente-solicitante.sql → fail-soft).
  if (body.esSolicitante === true) {
    const { error: eSol } = await r.admin.from("Cliente").update({ esSolicitante: true }).eq("id", miembroId);
    if (eSol && !/esSolicitante|column|schema cache|does not exist/i.test(eSol.message)) {
      return NextResponse.json({ error: eSol.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, id: miembroId });
}

// PATCH → parentesco y/o esSolicitante de un miembro (la ficha completa se edita con el
// modal «Editar» → PATCH /api/clientes/[id], ya existente).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { clienteId?: string; parentesco?: string; esSolicitante?: boolean };
  const clienteId = (body.clienteId ?? "").trim();
  if (!clienteId) return NextResponse.json({ error: "Falta el miembro." }, { status: 400 });

  const r = await resolverFamilia(id);
  if ("error" in r) return r.error;

  const { data: cli } = await r.admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

  if (typeof body.parentesco === "string" && body.parentesco.trim()) {
    if (!parentescoValido(body.parentesco.trim())) return NextResponse.json({ error: "Parentesco no válido." }, { status: 400 });
    const { error } = await r.admin.from("Cliente").update({ parentesco: body.parentesco.trim(), updatedAt: new Date().toISOString() }).eq("id", clienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (typeof body.esSolicitante === "boolean") {
    const { error: eSol } = await r.admin.from("Cliente").update({ esSolicitante: body.esSolicitante }).eq("id", clienteId);
    if (eSol) {
      const falta = /esSolicitante|column|schema cache|does not exist/i.test(eSol.message);
      return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/cliente-solicitante.sql." : eSol.message }, { status: falta ? 409 : 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

// DELETE → quita un miembro. Nunca el ancla de un expediente (la FK Expediente.clienteId
// es ON DELETE CASCADE: borrarlo arrastraría el expediente con sus documentos/facturas).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { clienteId?: string };
  const clienteId = (body.clienteId ?? "").trim();
  if (!clienteId) return NextResponse.json({ error: "Falta el miembro." }, { status: 400 });

  const r = await resolverFamilia(id);
  if ("error" in r) return r.error;

  const { data: cli } = await r.admin.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

  const { data: anchor } = await r.admin.from("Expediente").select("id").eq("clienteId", clienteId).limit(1).maybeSingle();
  if (anchor) return NextResponse.json({ error: "Ese miembro es el titular de un expediente; no se puede quitar." }, { status: 400 });

  // Vigía: borrar el Cliente arrastraría sus Vencimientos (FK ON DELETE CASCADE) — el radar
  // de SU tarjeta se apagaría en silencio. Con vencimiento activo, no se quita.
  try {
    const { data: venc } = await r.admin.from("Vencimiento").select("id").eq("clienteId", clienteId)
      .in("estado", ["PENDIENTE", "AVISADO", "TRAMITANDO"]).limit(1).maybeSingle();
    if (venc) return NextResponse.json({ error: "Ese miembro tiene un vencimiento activo en Vigía. Resuélvelo o cancélalo antes de quitarlo." }, { status: 400 });
  } catch { /* tabla Vigía ausente → sin guarda */ }

  // Storage: los documentos sueltos del miembro (DocumentoCliente) se borran en cascada en
  // la base, pero sus archivos (pasaporte, TIE…) quedarían huérfanos en el bucket → purga
  // fail-soft antes de borrar (mismo patrón que la eliminación de expedientes).
  try {
    const { data: docs } = await r.admin.from("DocumentoCliente").select("storagePath").eq("clienteId", clienteId);
    const paths = (docs ?? []).map((d) => d.storagePath as string).filter(Boolean);
    if (paths.length) await r.admin.storage.from("documentos").remove(paths);
  } catch { /* sin documentos o tabla ausente: no bloquea */ }

  const { error } = await r.admin.from("Cliente").delete().eq("id", clienteId).eq("familiaId", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
