import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { camposVacios, filaACliente } from "@/lib/csv-clientes";
import { PARENTESCOS } from "@/lib/familia";
import { oficinaDeFamilia } from "@/lib/oficinas-server";

// Crear un cliente NUEVO directamente dentro de una familia (desde la ficha de
// cualquiera de sus miembros). Antes solo se podía añadir a alguien que ya existía
// como cliente individual, lo que obligaba a crearlo aparte y volver.
//
// Autorización: sesión + la familia se resuelve BAJO RLS (anti-IDOR) antes de
// escribir con service_role. El workspace sale de la familia, nunca del cuerpo.

const PARENTESCOS_VALIDOS: Set<string> = new Set(PARENTESCOS.map(([v]) => v).filter((v) => v !== "TITULAR"));

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { nombre?: string; apellidos?: string; email?: string; telefono?: string; parentesco?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  // Autenticar ANTES de validar el cuerpo: un anónimo no debe distinguir «falta el
  // nombre» de «no autenticado» — y menos aún llegar a tocar la base.
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const nombre = (body.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "Indica al menos el nombre." }, { status: 400 });

  const { data: fam } = await supa.from("Familia").select("id, workspaceId, nombre").eq("id", id).maybeSingle();
  if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });
  const workspaceId = (fam as { workspaceId: string }).workspaceId;

  // Idioma heredado del titular: el nuevo miembro recibirá sus emails en la misma
  // lengua que el resto de la familia (si no, cae al castellano).
  const { data: tit } = await supa.from("Cliente").select("idioma").eq("familiaId", id).eq("parentesco", "TITULAR").limit(1).maybeSingle();

  const parentesco = PARENTESCOS_VALIDOS.has((body.parentesco ?? "").toUpperCase()) ? (body.parentesco ?? "").toUpperCase() : "OTRO";
  const campos = {
    ...camposVacios(),
    idioma: (tit as { idioma?: string | null } | null)?.idioma ?? "es",
    nombre,
    apellidos: (body.apellidos ?? "").trim(),
    email: (body.email ?? "").trim(),
    telefono: (body.telefono ?? "").trim(),
  };

  const admin = createSupabaseAdmin();
  // La sede se hereda de la FAMILIA, no de quien añade: un admin que completa una familia
  // de Gran Via desde su vista global no debe crear un miembro visible en todas partes.
  const sede = await oficinaDeFamilia(admin, id);
  const fila: Record<string, unknown> = { ...filaACliente(campos, workspaceId, sede), familiaId: id, parentesco };
  const { error } = await admin.from("Cliente").insert(fila);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: String(fila.id), nombre });
}

// ── Modificar un miembro (parentesco, «es solicitante») ──────────────────────
// El panel del gestor llamaba a PATCH y DELETE desde el primer día, pero esta ruta
// solo exportaba POST: ambas recibían un 405 y la pantalla decía «No se pudo
// guardar» (bug visto el 22/08/2026 al marcar «Solicitante»).
//
// Misma autorización que POST: sesión → familia BAJO RLS → comprobar que el cliente
// pertenece A ESA familia → escribir con service_role. El workspace jamás sale del
// cuerpo de la petición.
async function familiaYMiembro(id: string, clienteId: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  if (!clienteId) return { error: NextResponse.json({ error: "Falta el miembro." }, { status: 400 }) };

  const { data: fam } = await supa.from("Familia").select("id").eq("id", id).maybeSingle();
  if (!fam) return { error: NextResponse.json({ error: "Familia no encontrada." }, { status: 404 }) };

  // El miembro se lee BAJO SESIÓN y filtrando por familiaId: si es de otro despacho
  // —o de otra familia— sencillamente no existe.
  const { data: m } = await supa.from("Cliente").select("id, parentesco").eq("id", clienteId).eq("familiaId", id).maybeSingle();
  if (!m) return { error: NextResponse.json({ error: "Miembro no encontrado en esta familia." }, { status: 404 }) };
  return { miembro: m as { id: string; parentesco: string | null } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clienteId?: string; parentesco?: string; esSolicitante?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const c = await familiaYMiembro(id, (body.clienteId ?? "").trim());
  if (c.error) return c.error;

  const cambios: Record<string, unknown> = {};
  if (typeof body.esSolicitante === "boolean") cambios.esSolicitante = body.esSolicitante;
  if (typeof body.parentesco === "string") {
    const p = body.parentesco.toUpperCase();
    // TITULAR no se reparte a mano: hay uno y solo uno, y es el que sostiene la familia.
    if (p === "TITULAR" || !PARENTESCOS_VALIDOS.has(p)) {
      return NextResponse.json({ error: "Parentesco no válido." }, { status: 400 });
    }
    if (c.miembro!.parentesco === "TITULAR") {
      return NextResponse.json({ error: "El titular no puede cambiar de parentesco." }, { status: 409 });
    }
    cambios.parentesco = p;
  }
  if (!Object.keys(cambios).length) return NextResponse.json({ error: "Nada que cambiar." }, { status: 400 });

  const { error } = await createSupabaseAdmin().from("Cliente").update(cambios).eq("id", c.miembro!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...cambios });
}

// ── Sacar a un miembro de la familia ─────────────────────────────────────────
// NO borra al cliente: lo desvincula (familiaId = null). Sus expedientes, documentos
// y facturas siguen siendo suyos; simplemente deja de facturarse en bloque.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clienteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const c = await familiaYMiembro(id, (body.clienteId ?? "").trim());
  if (c.error) return c.error;
  if (c.miembro!.parentesco === "TITULAR") {
    return NextResponse.json({ error: "El titular no se puede sacar de su propia familia." }, { status: 409 });
  }

  const { error } = await createSupabaseAdmin()
    .from("Cliente").update({ familiaId: null, parentesco: null, esSolicitante: false }).eq("id", c.miembro!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
