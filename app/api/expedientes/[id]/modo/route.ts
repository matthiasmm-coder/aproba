import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Modo de trabajo del expediente: 'portal' (el cliente recibe el enlace) o 'manual'
// (el despacho lo trabaja internamente). Pedido de Matthias (22/08/2026): en manual,
// el producto NO debe pedir por ninguna parte que se envíe un enlace — ni en la
// tarjeta del tablero, ni en la ficha, ni en los recordatorios al cliente.
//
// Autorización: el expediente se resuelve BAJO SESIÓN (RLS) antes de usar el admin.
// La columna es nueva (supabase/modo-trabajo.sql): fail-soft si no se ha migrado.

const MODOS = new Set(["portal", "manual"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { modo?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const modo = typeof body.modo === "string" && MODOS.has(body.modo) ? body.modo : null;
  if (!modo) return NextResponse.json({ error: "modo debe ser 'portal' o 'manual'." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update({ modoTrabajo: modo, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) {
    const sinMigrar = /modoTrabajo|column|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: sinMigrar ? "Falta la migración supabase/modo-trabajo.sql." : error.message },
      { status: sinMigrar ? 501 : 500 },
    );
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: modo === "manual"
      ? "🖐 Modo manual: el despacho trabaja el expediente internamente (sin enlace al cliente)"
      : "🔗 Modo con enlace: el cliente aporta sus datos y documentos desde su portal",
    userId: user.id,
  });

  return NextResponse.json({ ok: true, modo });
}
