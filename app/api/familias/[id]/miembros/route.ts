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
