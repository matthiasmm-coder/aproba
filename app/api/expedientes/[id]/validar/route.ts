import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Validación MANUAL del expediente (22/08/2026, pedido de Matthias): con UN botón el
// gestor declara que Información, Documentos y Formularios están OK. El expediente pasa
// a 100 % de completitud y entra en «Listo para presentar».
//
// Por qué existe: el producto no puede saberlo todo. El cliente trae papeles en mano, un
// campo de la ficha no aplica a ese trámite, el formulario se preparó fuera… Sin esta
// salida, un expediente perfectamente listo se quedaba en 67 % para siempre y el número
// dejaba de significar nada. Es reversible: el mismo botón lo desvalida.
//
// Autorización: el expediente se resuelve BAJO SESIÓN (RLS) antes de tocar el admin.
// Columna nueva (supabase/validado-manual.sql): fail-soft si no se ha migrado.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { validado?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const validado = body.validado !== false; // por defecto validar

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("Expediente")
    .update({ validadoAt: validado ? new Date().toISOString() : null, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    const sinMigrar = /validadoAt|column|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: sinMigrar ? "Falta la migración supabase/validado-manual.sql." : error.message },
      { status: sinMigrar ? 501 : 500 },
    );
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: validado
      ? "✅ Expediente validado a mano: información, documentos y formularios OK — listo para presentar"
      : "↩️ Validación retirada: el expediente vuelve a su completitud calculada",
    userId: user.id,
  });

  return NextResponse.json({ ok: true, validado });
}
