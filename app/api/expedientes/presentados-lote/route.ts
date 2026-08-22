import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// PUESTA AL DÍA EN LOTE: «estos expedientes ya están presentados en Mercurio».
//
// Por qué existe (medición 22/08/2026, 79 expedientes reales): la segunda mitad del
// ciclo no se usaba — 43 expedientes de un mismo despacho llevaban 30 días (mediana)
// «listos para presentar» cuando en la realidad ya estaban presentados hace semanas.
// El tablero mentía y cada tarjeta pedía un clic declarativo que nadie iba a dar uno
// a uno. Esto permite decir la verdad de golpe.
//
// DELIBERADAMENTE SIN AVISOS: la presentación ocurrió hace tiempo; un correo hoy de
// «tu expediente se ha presentado» con fecha de hoy confundiría al cliente final. El
// aviso al presentar sigue existiendo en el flujo normal (avanzar), no aquí.

const PREPARACION = ["EN_PREPARACION", "BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO"];
const MAX = 100;

const fmtFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };

export async function POST(req: Request) {
  let body: { ids?: unknown; fecha?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  if (!ids.length) return NextResponse.json({ error: "Sin expedientes seleccionados." }, { status: 400 });
  const fecha = typeof body.fecha === "string" && body.fecha ? fmtFecha(body.fecha) : null;
  if (typeof body.fecha === "string" && body.fecha && !fecha) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // BAJO RLS: solo vuelven las filas de los workspaces del gestor. Todo id ajeno
  // desaparece aquí — la autorización ES el filtro, no una comprobación aparte.
  const { data: visibles, error: eSel } = await supabase
    .from("Expediente")
    .select("id, estado, formulariosGenerados, tasaPath")
    .in("id", ids);
  if (eSel) return NextResponse.json({ error: eSel.message }, { status: 500 });

  // Solo expedientes aún en preparación Y con algo generado (formularios o tasa):
  // marcar «presentado» un expediente donde no se preparó nada sería inventar historia.
  const elegibles = (visibles ?? []).filter((e) =>
    PREPARACION.includes(String(e.estado))
    && (Array.isArray((e as { formulariosGenerados?: unknown }).formulariosGenerados) || (e as { tasaPath?: string | null }).tasaPath),
  );
  if (!elegibles.length) return NextResponse.json({ ok: true, actualizados: 0, saltados: ids.length });

  const admin = createSupabaseAdmin();
  const ahora = new Date().toISOString();
  const okIds = elegibles.map((e) => e.id);
  // La fecha REAL de presentación es la que declara el gestor (estos expedientes se
  // presentaron hace semanas); sin ella, el día de la puesta al día.
  const fechaISO = typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? new Date(`${body.fecha}T12:00:00.000Z`).toISOString()
    : ahora;
  let { error: eUp } = await admin.from("Expediente").update({ estado: "PRESENTADO", updatedAt: ahora, fechaPresentacion: fechaISO }).in("id", okIds);
  if (eUp && /fechaPresentacion|column|schema cache/i.test(eUp.message)) {
    eUp = (await admin.from("Expediente").update({ estado: "PRESENTADO", updatedAt: ahora }).in("id", okIds)).error;
  }
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });

  const desc = `Expediente presentado en la Administración${fecha ? ` (el ${fecha})` : ""} — puesta al día en lote, sin avisos`;
  const { error: eEv } = await admin.from("ExpedienteEvento").insert(
    okIds.map((expedienteId) => ({ id: crypto.randomUUID(), expedienteId, tipo: "PRESENTADO", descripcion: desc, userId: user.id })),
  );
  if (eEv) console.error("[presentados-lote eventos]", eEv.message); // el estado ya está bien: no se revierte por el historial

  return NextResponse.json({ ok: true, actualizados: okIds.length, saltados: ids.length - okIds.length });
}
