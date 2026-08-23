import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// El GESTOR define QUÉ documentos hay que reunir en ESTE expediente, además de los
// del servicio. Sin esto, un trámite «Otro» o un servicio propio creado sin lista
// dejaba la ficha muda («Sin documentos en este expediente») y el gestor tenía que
// acordarse de memoria — el caso que señaló Matthias el 23/08. Sesión + RLS.
// El cuerpo trae la lista COMPLETA de los añadidos a mano (idempotente).

const MAX_DOCS = 25;
const MAX_LARGO = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { docs?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  if (!Array.isArray(body.docs)) return NextResponse.json({ error: "Falta la lista de documentos." }, { status: 400 });

  // Saneado: recorta, quita vacíos y duplicados (por etiqueta exacta, sin distinguir
  // mayúsculas) y limita el tamaño — la lista pilota las casillas del portal.
  const vistos = new Set<string>();
  const docs: string[] = [];
  for (const d of body.docs) {
    if (typeof d !== "string") continue;
    const limpio = d.trim().replace(/\s+/g, " ").slice(0, MAX_LARGO);
    if (!limpio) continue;
    const clave = limpio.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    docs.push(limpio);
    if (docs.length >= MAX_DOCS) break;
  }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // RLS: la lectura con la sesión del gestor es la que decide si el expediente es suyo.
  // El repli GATED por el mensaje distingue «columna ausente» (migración pendiente) de
  // un fallo transitorio — confundirlos aquí borraría la lista en silencio.
  let q = await supa.from("Expediente").select("id, docsExtra").eq("id", id).maybeSingle();
  const faltaColumna = Boolean(q.error && /docsExtra|column|schema cache/i.test(q.error.message));
  if (q.error && !faltaColumna) return NextResponse.json({ error: q.error.message }, { status: 500 });
  if (faltaColumna) q = await supa.from("Expediente").select("id").eq("id", id).maybeSingle() as typeof q;
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 500 });
  const exp = q.data as { id: string; docsExtra?: string[] | null } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  if (faltaColumna) {
    return NextResponse.json({ error: "Falta la migración: ejecuta supabase/docs-expediente.sql en Supabase." }, { status: 409 });
  }

  const previos = Array.isArray(exp.docsExtra) ? exp.docsExtra.filter(Boolean) : [];
  const igual = previos.length === docs.length && previos.every((x, i) => docs[i] === x);
  if (igual) return NextResponse.json({ ok: true, docs });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update({ docsExtra: docs, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Historial: qué entró y qué salió (el cliente ve cambiar sus casillas).
  const añadidos = docs.filter((d) => !previos.includes(d));
  const quitados = previos.filter((d) => !docs.includes(d));
  const partes: string[] = [];
  if (añadidos.length) partes.push(`Documentos pedidos: ${añadidos.join(", ")}`);
  if (quitados.length) partes.push(`Documentos retirados: ${quitados.join(", ")}`);
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: id,
    tipo: "ESTADO_CAMBIADO",
    descripcion: partes.join(" · ") || "Documentos del expediente actualizados",
  });

  // El progreso (anillo, «faltan N», estado del tablero) se recalcula a la LECTURA
  // en lib/progreso.ts a partir de esta lista: no hay nada que reescribir aquí.

  return NextResponse.json({ ok: true, docs });
}
