import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { camposVacios, filaACliente } from "@/lib/csv-clientes";
import { PARENTESCOS } from "@/lib/familia";

// Familia de un cliente, desde su ficha. Autorización: sesión + el cliente (y la
// familia destino) se resuelven BAJO RLS (anti-IDOR) antes de escribir con service_role.
// · POST sin familiaId → CREAR una familia (el cliente pasa a ser TITULAR, miembros
//   opcionales con los datos esenciales).
// · POST con familiaId → UNIR este cliente a una familia EXISTENTE (parentesco elegido).
// · DELETE → QUITAR al cliente de su familia (vuelve a ser individual). El TITULAR no
//   puede salir (elimina la familia en su lugar) ni el solicitante de un expediente
//   familiar de esa familia (misma regla que el portal).

type MiembroBody = {
  nombre?: string; apellidos?: string; fechaNacimiento?: string;
  numeroDocumento?: string; pasaporte?: string; email?: string; telefono?: string;
  parentesco?: string;
};

const PARENTESCOS_VALIDOS: Set<string> = new Set(PARENTESCOS.map(([v]) => v).filter((v) => v !== "TITULAR"));

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { nombre?: string; miembros?: MiembroBody[]; familiaId?: string; parentesco?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia al workspace bajo RLS; repli si la columna familiaId aún no existe.
  type Row = { id: string; workspaceId: string; apellidos: string | null; idioma: string | null; familiaId?: string | null; oficinaId?: string | null };
  let res = await supa.from("Cliente").select("id, workspaceId, apellidos, idioma, familiaId, oficinaId").eq("id", id).maybeSingle();
  if (res.error) res = await supa.from("Cliente").select("id, workspaceId, apellidos, idioma, familiaId").eq("id", id).maybeSingle() as typeof res; // sin multi-oficina
  if (res.error) {
    res = await supa.from("Cliente").select("id, workspaceId, apellidos, idioma").eq("id", id).maybeSingle() as typeof res;
    if (res.error) return NextResponse.json({ error: "Falta la migración: ejecuta supabase/familia.sql en Supabase." }, { status: 500 });
  }
  const cliente = res.data as Row | null;
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  if (cliente.familiaId) return NextResponse.json({ error: "Este cliente ya pertenece a una familia." }, { status: 409 });

  // ── Unir a una familia EXISTENTE ──
  if (body.familiaId) {
    const { data: fam } = await supa.from("Familia").select("id, nombre").eq("id", body.familiaId).maybeSingle();
    if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });
    const parentesco = PARENTESCOS_VALIDOS.has((body.parentesco ?? "").toUpperCase()) ? (body.parentesco ?? "").toUpperCase() : "OTRO";
    const admin = createSupabaseAdmin();
    const { error: eU } = await admin.from("Cliente").update({ familiaId: fam.id, parentesco, updatedAt: new Date().toISOString() }).eq("id", id);
    if (eU) return NextResponse.json({ error: eU.message }, { status: 500 });
    return NextResponse.json({ ok: true, familiaId: fam.id, nombre: (fam as { nombre?: string }).nombre ?? "" });
  }

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
    // Los miembros nacen en la sede del titular: la familia entera vive en la misma oficina.
    const { error: eM } = await admin.from("Cliente").insert({ ...filaACliente(campos, cliente.workspaceId, cliente.oficinaId ?? null), familiaId: famId, parentesco });
    if (eM) fallos.push(`${nombre}: ${eM.message}`);
    else insertados++;
  }

  return NextResponse.json({ ok: true, familiaId: famId, nombre: nombreFam, insertados, fallos });
}

// QUITAR al cliente de su familia (vuelve a ser individual). El titular no puede salir;
// un solicitante de un expediente familiar de esa familia tampoco (regla del portal).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: cliente } = await supa.from("Cliente").select("id, familiaId, parentesco, nombre").eq("id", id).maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  const c = cliente as { id: string; familiaId?: string | null; parentesco?: string | null; nombre: string | null };
  if (!c.familiaId) return NextResponse.json({ error: "Este cliente no pertenece a ninguna familia." }, { status: 400 });
  if (c.parentesco === "TITULAR") {
    return NextResponse.json({ error: "El titular no puede salir de la familia. Elimina la familia si quieres disolverla." }, { status: 409 });
  }
  const { data: expFam } = await supa.from("Expediente").select("id, referencia").eq("familiaId", c.familiaId).eq("clienteId", id).limit(1).maybeSingle();
  if (expFam) {
    return NextResponse.json({ error: `Es el solicitante del expediente familiar ${(expFam as { referencia?: string }).referencia ?? ""}. Cambia el solicitante antes de quitarlo.` }, { status: 409 });
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Cliente").update({ familiaId: null, parentesco: null, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
