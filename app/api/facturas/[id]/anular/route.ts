import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Anula una factura EMITIDA/VENCIDA: la deja sin efecto SIN borrarla ni romper la
// numeración correlativa. Es la operación que un despacho necesita cuando una factura
// se emitió mal — la alternativa que existía era eliminarla, que hace desaparecer el
// número de la serie (mala práctica contable).
//
// Descubierto en la auditoría del 06/08/2026: la app YA remitía a esta acción
// («Anúlala antes de fraccionar») pero no existía en ninguna parte.
//
// Autorización: la factura se resuelve BAJO SESIÓN (RLS) antes de escribir con el admin.
// Anular NO es destructivo (el documento sigue ahí, con su número y su historial), así que
// cualquier miembro del despacho puede hacerlo — como archivar. Eliminar sigue siendo admin.
//
// Invariantes (ya blindados en el resto del sistema el 06/08):
//   · una PAGADA no se anula: el dinero está cobrado → rectificativa o devolución;
//   · una ANULADA no se cobra (checkout) ni se marca pagada (marcarFacturaPagada).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { motivo?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const motivo = String(body.motivo ?? "").trim().slice(0, 300);

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: f } = await supa
    .from("Factura")
    .select("id, numero, estado, expedienteId, total")
    .eq("id", id)
    .maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const estado = String(f.estado);
  if (estado === "ANULADA") return NextResponse.json({ ok: true, estado: "ANULADA", yaEstaba: true });
  if (estado === "PAGADA") {
    return NextResponse.json(
      { error: "Una factura pagada no se anula: el cobro ya se ha producido. Emite una rectificativa o registra la devolución." },
      { status: 409 },
    );
  }

  const admin = createSupabaseAdmin();
  // Update CONDICIONAL: si otro miembro la cobra entre el select y el update, no la pisamos.
  const { data: upd, error } = await admin
    .from("Factura")
    .update({ estado: "ANULADA" })
    .eq("id", id)
    .neq("estado", "PAGADA")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!upd?.length) {
    return NextResponse.json({ error: "La factura se ha cobrado mientras tanto: ya no se puede anular." }, { status: 409 });
  }

  // Traza en el historial del expediente — anular es una decisión contable, debe verse.
  if (f.expedienteId) {
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: f.expedienteId,
      tipo: "COMENTARIO",
      descripcion: `🚫 Factura ${f.numero} anulada (${Number(f.total).toFixed(2).replace(".", ",")} €)${motivo ? ` — ${motivo}` : ""}`,
      userId: user.id,
    });
  }

  return NextResponse.json({ ok: true, estado: "ANULADA" });
}
