import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { camposVacios, filaACliente } from "@/lib/csv-clientes";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { fetchTrabajadoresDeExpediente } from "@/lib/data/trabajadores";
import { nombreCompleto } from "@/lib/trabajadores";

// Añadir un TRABAJADOR a un expediente DE EMPRESA (Luis, 21/09/2026): uno existente del
// despacho (se ata a la empresa si no tenía) o uno nuevo (lo mínimo: el nombre; el resto
// de la ficha se completa luego, a mano o con la lectura de sus documentos).
//
// Bajo RLS: el expediente y el cliente existente se resuelven con la sesión del gestor
// (otro despacho = «no existe»); la escritura va con service_role, con el workspace del
// expediente y nunca del cuerpo. Cada trabajador consume UNA unidad de la cuota mensual.

const uuid = () => crypto.randomUUID();
const faltaMigracion = (msg: string) => /ExpedienteTrabajador|relation|does not exist|schema cache/i.test(msg);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clienteId?: string; nuevo?: { nombre?: string; apellidos?: string; email?: string; telefono?: string; nacionalidad?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: expRaw } = await supa.from("Expediente").select("id, workspaceId, empresaId, oficinaId, referencia").eq("id", id).maybeSingle();
  if (!expRaw) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  const exp = expRaw as { id: string; workspaceId: string; empresaId: string | null; oficinaId: string | null; referencia: string };
  if (!exp.empresaId) return NextResponse.json({ error: "Este expediente no es de una empresa." }, { status: 400 });

  const admin = createSupabaseAdmin();
  let clienteId = String(body.clienteId ?? "").trim();
  let nombre = "";

  if (clienteId) {
    // Trabajador EXISTENTE (bajo RLS). Sin empresa → se ata a esta; con otra empresa se
    // respeta (la gente cambia de empleador): el expediente factura a SU empresa igualmente.
    const { data: c } = await supa.from("Cliente").select("id, nombre, apellidos, empresaId, oficinaId").eq("id", clienteId).maybeSingle();
    if (!c) return NextResponse.json({ error: "Trabajador no encontrado." }, { status: 404 });
    const cl = c as { id: string; nombre: string; apellidos: string | null; empresaId: string | null; oficinaId: string | null };
    nombre = nombreCompleto(cl);
    const patch: Record<string, unknown> = {};
    if (!cl.empresaId) patch.empresaId = exp.empresaId;
    if (!cl.oficinaId && exp.oficinaId) patch.oficinaId = exp.oficinaId;
    if (Object.keys(patch).length) await admin.from("Cliente").update(patch).eq("id", clienteId).eq("workspaceId", exp.workspaceId);
  } else {
    const n = String(body.nuevo?.nombre ?? "").trim();
    if (!n) return NextResponse.json({ error: "El nombre del trabajador es obligatorio." }, { status: 400 });
    const campos = camposVacios();
    campos.nombre = n.slice(0, 120);
    campos.apellidos = String(body.nuevo?.apellidos ?? "").trim().slice(0, 120);
    campos.email = String(body.nuevo?.email ?? "").trim().slice(0, 200);
    campos.telefono = String(body.nuevo?.telefono ?? "").trim().slice(0, 40);
    campos.nacionalidad = String(body.nuevo?.nacionalidad ?? "").trim().slice(0, 80);
    // Nace en el workspace y la sede del EXPEDIENTE (la de su empresa), como trabajador de ella.
    const fila: Record<string, unknown> = { ...filaACliente(campos, exp.workspaceId, exp.oficinaId ?? null), empresaId: exp.empresaId };
    clienteId = String(fila.id);
    nombre = nombreCompleto({ nombre: campos.nombre, apellidos: campos.apellidos });
    const { error } = await admin.from("Cliente").insert(fila);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // La fila del trabajador en el expediente. El token es la credencial de SU enlace
  // individual (32 hex = 128 bits, como el portalToken): solo sus documentos y su mandato.
  const token = uuid().replace(/-/g, "");
  const { error: eT } = await admin.from("ExpedienteTrabajador").insert({ id: uuid(), workspaceId: exp.workspaceId, expedienteId: exp.id, clienteId, token });
  if (eT) {
    if (/duplicate|unique|23505/i.test(eT.message)) return NextResponse.json({ error: "Este trabajador ya está en el expediente." }, { status: 409 });
    if (faltaMigracion(eT.message)) return NextResponse.json({ error: "Falta la migración: ejecuta supabase/expediente-trabajadores.sql." }, { status: 500 });
    return NextResponse.json({ error: eT.message }, { status: 500 });
  }
  await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: `Trabajador añadido al expediente: ${nombre}`, userId: user.id });

  // Cuota: cada trabajador es un trámite → UNA unidad (best-effort, nunca rompe el alta).
  await cobrarOverageSiProcede(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, referencia: exp.referencia, unidad: clienteId });

  const lista = await fetchTrabajadoresDeExpediente(exp.id, admin);
  return NextResponse.json({ ok: true, clienteId, trabajador: lista.find((t) => t.id === clienteId) ?? null, total: lista.length });
}
