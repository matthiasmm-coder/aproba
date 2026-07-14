import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Crea una nota de trabajo en el expediente («cita solicitada», «a la espera de las
// apostillas», …). Sesión + resolución BAJO RLS del expediente (anti-IDOR) antes de usar el
// admin; se guarda el autor (id + nombre snapshot). Cualquier miembro del workspace puede
// anotar: es un bloc compartido del despacho.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { texto?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "La nota está vacía." }, { status: 400 });
  if (texto.length > 4000) return NextResponse.json({ error: "La nota es demasiado larga." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del usuario.
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Nombre del autor para el snapshot (sobrevive a bajas del equipo).
  const { data: perfil } = await supa.from("User").select("nombre, email").eq("id", user.id).maybeSingle();
  const autorNombre = (perfil as { nombre?: string | null; email?: string | null } | null)?.nombre
    || (perfil as { email?: string | null } | null)?.email || null;

  const admin = createSupabaseAdmin();
  const { data: nota, error } = await admin
    .from("ExpedienteNota")
    .insert({
      id: crypto.randomUUID(),
      workspaceId: (exp as { workspaceId: string }).workspaceId,
      expedienteId: id,
      autorId: perfil ? user.id : null, // evita violar la FK si el user no tiene fila en User
      autorNombre,
      texto,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // Solo «tabla ausente» → 409 migración; NO los errores de constraint (FK/not-null) post-migración.
    const sinMigrar = /does not exist|schema cache|find the table/i.test(error.message);
    return NextResponse.json(
      { error: sinMigrar ? "Falta la migración: ejecuta supabase/expediente-notas.sql en Supabase." : error.message },
      { status: sinMigrar ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, id: (nota as { id: string } | null)?.id });
}
