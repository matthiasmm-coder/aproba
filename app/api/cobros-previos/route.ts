import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Marca como COBRADO (o devuelve a PENDIENTE) lo facturado ANTES de Aproba — trámites
// importados con la columna «Estado del cobro» (Luis, 24/09/2026). No toca ninguna factura
// de Aproba: solo el estado de esa deuda anterior.
//   POST { tipo: "servicio" | "expediente", id, cobro: "COBRADA" | "PENDIENTE" }
// La propiedad se valida bajo RLS (la fila debe verse con la sesión del usuario); la
// escritura va con el cliente admin, acotada a ese id y a su workspace.

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  const body = (await req.json().catch(() => ({}))) as { tipo?: unknown; id?: unknown; cobro?: unknown };
  const tipo = body.tipo === "servicio" || body.tipo === "expediente" ? body.tipo : null;
  const id = typeof body.id === "string" && body.id.length <= 64 ? body.id : null;
  const cobro = body.cobro === "COBRADA" || body.cobro === "PENDIENTE" ? body.cobro : null;
  if (!tipo || !id || !cobro) return fail("Petición incompleta.");

  const tabla = tipo === "servicio" ? "ServicioHistorico" : "Expediente";
  const columna = tipo === "servicio" ? "cobro" : "cobroPrevio";
  const { data: fila, error } = await supabase.from(tabla).select(`id, workspaceId, ${columna}`).eq("id", id).maybeSingle();
  if (error) {
    if (new RegExp(columna, "i").test(error.message)) return fail("Falta ejecutar supabase/cobro-previo.sql en Supabase.", 409);
    return fail("No se pudo leer el cobro.", 500);
  }
  if (!fila) return fail("No encontrado.", 404);
  const actual = (fila as Record<string, unknown>)[columna] as string | null;
  if (!actual) return fail("Este trámite no tiene un cobro anterior a Aproba.", 409);
  if (actual === cobro) return NextResponse.json({ ok: true, cobro });

  const admin = createSupabaseAdmin();
  const workspaceId = (fila as { workspaceId: string }).workspaceId;
  const { error: eUp } = await admin.from(tabla).update({ [columna]: cobro, updatedAt: new Date().toISOString() }).eq("id", id).eq("workspaceId", workspaceId);
  if (eUp) return fail("No se pudo guardar el cobro.", 500);

  if (tipo === "expediente") {
    const descripcion = cobro === "COBRADA" ? "💶 Lo facturado antes de Aproba: marcado como cobrado." : "💶 Lo facturado antes de Aproba: vuelve a pendiente de cobro.";
    await admin.from("ExpedienteEvento").insert({ id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", descripcion, userId: user.id });
  }
  return NextResponse.json({ ok: true, cobro });
}
