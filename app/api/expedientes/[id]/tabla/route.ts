import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cambiosTablaValidos } from "@/lib/expedientes-tabla";
import { normalizarEstado } from "@/lib/progreso";

// CELDAS EDITABLES de la Tabla de expedientes (Jennifer, Gesnet, 03/10/2026: «seleccionar el
// campo y escribir el colaborador», «rellenar a mano la fecha de presentación»). Una ruta para
// los datos que solo viven aquí: colaborador, fecha de presentación y tasa pagada. «Tramitado
// por» y «Resolución» usan sus rutas de siempre (/asignado y /salida), como la ficha.
// Cualquier miembro del despacho: son datos del trámite que apunta quien los tiene delante.
// Anti-IDOR: el expediente se resuelve BAJO RLS (un id ajeno no existe).
//
// Fecha de presentación en un expediente aún EN PREPARACIÓN = se presentó ese día: pasa a
// «Presentado» (como «Presentados en lote»). Borrarla no deshace el estado.
const fechaLarga = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const cambios = cambiosTablaValidos(body);
  if ("error" in cambios) return NextResponse.json({ error: cambios.error }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id, estado").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: ahora };
  const eventos: { tipo: string; descripcion: string }[] = [];
  let estado: string | null = null;

  if ("colaborador" in cambios) {
    patch.colaborador = cambios.colaborador;
    eventos.push({ tipo: "COMENTARIO", descripcion: cambios.colaborador ? `🤝 Colaborador: ${cambios.colaborador}` : "🤝 Colaborador retirado" });
  }
  if ("tasaPagadaEl" in cambios) {
    patch.tasaPagadaEl = cambios.tasaPagadaEl;
    eventos.push({ tipo: "COMENTARIO", descripcion: cambios.tasaPagadaEl ? `💶 Tasa pagada el ${fechaLarga(cambios.tasaPagadaEl)}` : "💶 Tasa marcada como no pagada" });
  }
  if ("fechaPresentacion" in cambios) {
    const f = cambios.fechaPresentacion;
    patch.fechaPresentacion = f ? new Date(`${f}T12:00:00.000Z`).toISOString() : null;
    if (f && normalizarEstado(String(exp.estado)) === "EN_PREPARACION") { patch.estado = "PRESENTADO"; estado = "PRESENTADO"; }
    eventos.push(f
      ? { tipo: estado ? "PRESENTADO" : "COMENTARIO", descripcion: estado ? `Expediente presentado en la Administración el ${fechaLarga(f)} (anotado en la Tabla)` : `📅 Fecha de presentación: ${fechaLarga(f)} (anotada en la Tabla)` }
      : { tipo: "COMENTARIO", descripcion: "📅 Fecha de presentación retirada" });
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update(patch).eq("id", id);
  if (error) {
    const falta = /colaborador|tasaPagadaEl|column|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Esta columna aún no está activada en tu despacho. Escríbenos y la activamos." : error.message }, { status: 500 });
  }
  if (eventos.length) {
    const { error: eEv } = await admin.from("ExpedienteEvento").insert(eventos.map((e) => ({ id: crypto.randomUUID(), expedienteId: id, userId: user.id, ...e })));
    if (eEv) console.error("[tabla eventos]", eEv.message); // el dato ya está guardado: el historial no lo revierte
  }
  return NextResponse.json({ ok: true, ...cambios, ...(estado ? { estado } : {}) });
}
