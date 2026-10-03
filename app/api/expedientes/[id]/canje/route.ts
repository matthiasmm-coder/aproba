import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosCanjeValidos } from "@/lib/canje";

// CANJE DEL PERMISO DE CONDUCIR (Jennifer y Samara, 03/10/2026): guarda los datos del permiso
// extranjero de ESTE expediente (lib/canje.ts). Cualquier miembro del despacho.
// Anti-IDOR: el expediente se resuelve BAJO RLS (un id ajeno no existe).
const fechaLarga = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const datos = datosCanjeValidos(body);

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: antes, error: eLeer } = await admin.from("Expediente").select("canje").eq("id", id).maybeSingle();
  if (eLeer) {
    const falta = /canje|column|schema cache/i.test(eLeer.message);
    return NextResponse.json({ error: falta ? "El canje aún no está activado en tu despacho. Escríbenos y lo activamos." : eLeer.message }, { status: 500 });
  }
  const previo = datosCanjeValidos((antes as { canje?: unknown } | null)?.canje);
  const { error } = await admin.from("Expediente").update({ canje: datos, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Al historial, lo que cuenta en el trámite: los datos del permiso y la entrega en la Jefatura.
  const eventos: string[] = [];
  if (datos.entregadoEl && datos.entregadoEl !== previo.entregadoEl) eventos.push(`🚗 Permiso original entregado en la Jefatura el ${fechaLarga(datos.entregadoEl)} (autorización provisional)`);
  const sinEntrega = (d: typeof datos) => JSON.stringify({ ...d, entregadoEl: "" });
  if (sinEntrega(datos) !== sinEntrega(previo)) eventos.push(`🚗 Datos del permiso de conducir: ${[datos.pais, datos.numero, datos.clases.join(", ")].filter(Boolean).join(" · ") || "borrados"}`);
  if (eventos.length) {
    const { error: eEv } = await admin.from("ExpedienteEvento").insert(eventos.map((descripcion) => ({ id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id, descripcion })));
    if (eEv) console.error("[canje eventos]", eEv.message);
  }
  return NextResponse.json({ ok: true, canje: datos });
}
