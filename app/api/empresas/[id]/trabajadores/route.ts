import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { camposVacios, filaACliente } from "@/lib/csv-clientes";

// Añadir un TRABAJADOR a una empresa existente, desde su ficha (petición Luis y Marta,
// 17/09/2026). Lo mínimo para que exista: nombre. El resto de la ficha se completa luego
// a mano o solo, con la lectura de sus documentos. Bajo RLS: una empresa de otro despacho
// «no existe», y el cliente nace en el workspace y la sede de SU empresa.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { nombre?: string; apellidos?: string; email?: string; telefono?: string; nacionalidad?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const nombre = String(body.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "El nombre del trabajador es obligatorio." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: emp } = await supa.from("Empresa").select("id, workspaceId, oficinaId").eq("id", id).maybeSingle();
  if (!emp) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  const e = emp as { id: string; workspaceId: string; oficinaId?: string | null };

  const campos = camposVacios();
  campos.nombre = nombre.slice(0, 120);
  campos.apellidos = String(body.apellidos ?? "").trim().slice(0, 120);
  campos.email = String(body.email ?? "").trim().slice(0, 200);
  campos.telefono = String(body.telefono ?? "").trim().slice(0, 40);
  campos.nacionalidad = String(body.nacionalidad ?? "").trim().slice(0, 80);
  const fila: Record<string, unknown> = { ...filaACliente(campos, e.workspaceId, e.oficinaId ?? null), empresaId: e.id };
  const clienteId = String(fila.id);
  const { error } = await supa.from("Cliente").insert(fila);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: clienteId });
}
