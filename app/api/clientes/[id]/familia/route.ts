import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { camposVacios, filaACliente } from "@/lib/csv-clientes";
import { PARENTESCOS } from "@/lib/familia";

// Crear una FAMILIA a partir de un cliente individual existente (sección al pie de su
// ficha): el cliente pasa a ser el TITULAR y los miembros opcionales se crean con los
// datos esenciales. Autorización: sesión + el cliente se resuelve BAJO RLS (anti-IDOR)
// antes de escribir con service_role — mismo patrón que el PATCH de la ficha.

type MiembroBody = {
  nombre?: string; apellidos?: string; fechaNacimiento?: string;
  numeroDocumento?: string; pasaporte?: string; email?: string; telefono?: string;
  parentesco?: string;
};

const PARENTESCOS_VALIDOS: Set<string> = new Set(PARENTESCOS.map(([v]) => v).filter((v) => v !== "TITULAR"));

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { nombre?: string; miembros?: MiembroBody[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia al workspace bajo RLS; repli si la columna familiaId aún no existe.
  type Row = { id: string; workspaceId: string; apellidos: string | null; idioma: string | null; familiaId?: string | null };
  let res = await supa.from("Cliente").select("id, workspaceId, apellidos, idioma, familiaId").eq("id", id).maybeSingle();
  if (res.error) {
    res = await supa.from("Cliente").select("id, workspaceId, apellidos, idioma").eq("id", id).maybeSingle() as typeof res;
    if (res.error) return NextResponse.json({ error: "Falta la migración: ejecuta supabase/familia.sql en Supabase." }, { status: 500 });
  }
  const cliente = res.data as Row | null;
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  if (cliente.familiaId) return NextResponse.json({ error: "Este cliente ya pertenece a una familia." }, { status: 409 });

  const nombreFam = (body.nombre ?? "").trim()
    || ((cliente.apellidos ?? "").trim() ? `Familia ${(cliente.apellidos ?? "").trim()}` : "");
  if (!nombreFam) return NextResponse.json({ error: "Indica el nombre de la familia." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const famId = randomUUID();
  const ahora = new Date().toISOString();
  const { error: eF } = await admin.from("Familia").insert({ id: famId, workspaceId: cliente.workspaceId, nombre: nombreFam, updatedAt: ahora });
  if (eF) return NextResponse.json({ error: eF.message }, { status: 500 });

  const { error: eT } = await admin.from("Cliente").update({ familiaId: famId, parentesco: "TITULAR", updatedAt: ahora }).eq("id", id);
  if (eT) {
    // Sin titular no hay familia: no dejar una vacía huérfana.
    await admin.from("Familia").delete().eq("id", famId);
    return NextResponse.json({ error: eT.message }, { status: 500 });
  }

  // Miembros opcionales (los sin nombre se ignoran). Heredan el idioma del titular.
  let insertados = 0;
  const fallos: string[] = [];
  for (const m of (body.miembros ?? []).slice(0, 20)) {
    const nombre = (m.nombre ?? "").trim();
    if (!nombre) continue;
    const campos = {
      ...camposVacios(), idioma: cliente.idioma ?? "es",
      nombre, apellidos: (m.apellidos ?? "").trim(), fechaNacimiento: (m.fechaNacimiento ?? "").trim(),
      numeroDocumento: (m.numeroDocumento ?? "").trim(), pasaporte: (m.pasaporte ?? "").trim(),
      email: (m.email ?? "").trim(), telefono: (m.telefono ?? "").trim(),
    };
    const parentesco = PARENTESCOS_VALIDOS.has((m.parentesco ?? "").toUpperCase()) ? (m.parentesco ?? "").toUpperCase() : "OTRO";
    const { error: eM } = await admin.from("Cliente").insert({ ...filaACliente(campos, cliente.workspaceId), familiaId: famId, parentesco });
    if (eM) fallos.push(`${nombre}: ${eM.message}`);
    else insertados++;
  }

  return NextResponse.json({ ok: true, familiaId: famId, nombre: nombreFam, insertados, fallos });
}
