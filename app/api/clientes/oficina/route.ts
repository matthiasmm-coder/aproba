import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { oficinaValida } from "@/lib/oficinas-server";

// Reasignación EN MASA de clientes a una oficina. Sin esto, un despacho que migró su
// cartera antes de crear sus sedes tendría que abrir 187 fichas de una en una
// (caso Gesnet: 187 clientes importados el 12/08, oficinas creadas después).
//
// Anti-IDOR: los ids llegan del navegador → se filtran BAJO RLS contra el workspace
// del llamante antes de escribir nada. Un id ajeno simplemente desaparece de la lista.

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const LOTE = 200; // el `in()` de PostgREST viaja en la URL: por encima, 414

export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  let body: { clienteIds?: unknown; oficinaId?: string | null };
  try { body = await req.json(); } catch { return fail("Petición inválida."); }

  const ids = Array.isArray(body.clienteIds) ? body.clienteIds.map(String).filter(Boolean) : [];
  if (!ids.length) return fail("Selecciona al menos un cliente.");

  const { data: myMem } = await supa.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!myMem) return fail("No perteneces a ningún despacho.", 403);
  const ws = (myMem as { workspaceId: string }).workspaceId;

  const admin = createSupabaseAdmin();
  let oficinaId: string | null = null;
  if (body.oficinaId !== null && body.oficinaId !== undefined && String(body.oficinaId) !== "") {
    oficinaId = String(body.oficinaId);
    if (!(await oficinaValida(admin, oficinaId, ws))) return fail("Oficina no encontrada.", 404);
  }

  // Solo los ids que EXISTEN en mi despacho (resueltos bajo RLS), por lotes.
  const mios: string[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data } = await supa.from("Cliente").select("id").in("id", ids.slice(i, i + LOTE));
    for (const c of (data ?? []) as { id: string }[]) mios.push(c.id);
  }
  if (!mios.length) return fail("Ningún cliente válido.", 404);

  // Clientes + SUS expedientes, para que el board no siga mostrando los trámites
  // bajo la sede antigua.
  for (let i = 0; i < mios.length; i += LOTE) {
    const lote = mios.slice(i, i + LOTE);
    const { error } = await admin.from("Cliente")
      .update({ oficinaId, updatedAt: new Date().toISOString() }).in("id", lote).eq("workspaceId", ws);
    if (error) return fail(error.message, 500);
    const { error: eExp } = await admin.from("Expediente").update({ oficinaId }).in("clienteId", lote).eq("workspaceId", ws);
    if (eExp) return fail(eExp.message, 500);
  }

  return NextResponse.json({ ok: true, movidos: mios.length, oficinaId });
}
