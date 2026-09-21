import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { AVISAR_DIAS_DEFECTO } from "@/lib/requerimientos";

// Alta de un REQUERIMIENTO en un expediente (petición de Jennifer, 21/09/2026).
//
// La gestoría MANDA: ella escribe la fecha límite que lee en el requerimiento (la app
// solo le ofrece calcular 10 días hábiles como ayuda) y ella elige con cuántos días de
// antelación quiere el aviso. Aquí no se avisa a nadie: el recordatorio sale del tick
// diario, y SIEMPRE al despacho, nunca al cliente.
export const dynamic = "force-dynamic";

const falta = (m: string) => /relation .*Requerimiento.* does not exist|schema cache|PGRST205|column/i.test(m);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { asunto?: string; fechaLimite?: string; recibidoEl?: string | null; docs?: unknown; avisarDias?: number; notas?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // El expediente se lee BAJO SESIÓN: la RLS ya impide tocar el de otro despacho.
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const asunto = String(body.asunto ?? "").trim().slice(0, 400);
  if (!asunto) return NextResponse.json({ error: "Escribe qué te piden." }, { status: 400 });
  const limite = new Date(String(body.fechaLimite ?? ""));
  if (Number.isNaN(limite.getTime())) return NextResponse.json({ error: "Falta la fecha límite del requerimiento." }, { status: 400 });
  const recibido = body.recibidoEl ? new Date(String(body.recibidoEl)) : null;
  const docs = Array.isArray(body.docs) ? (body.docs as unknown[]).map((d) => String(d).trim().slice(0, 120)).filter(Boolean).slice(0, 30) : [];
  // Umbral de aviso: suyo. Se acota a 1-60 días para que un cero o un 999 no dejen el aviso mudo.
  const avisarDias = Math.min(60, Math.max(1, Math.round(Number(body.avisarDias ?? AVISAR_DIAS_DEFECTO)) || AVISAR_DIAS_DEFECTO));

  const admin = createSupabaseAdmin();
  const { data: perfil } = await supa.from("User").select("nombre, email").eq("id", user.id).maybeSingle();
  const autor = (perfil as { nombre?: string | null; email?: string | null } | null)?.nombre
    || (perfil as { email?: string | null } | null)?.email || null;

  const { data: fila, error } = await admin.from("Requerimiento").insert({
    id: crypto.randomUUID(),
    workspaceId: (exp as { workspaceId: string }).workspaceId,
    expedienteId: id,
    asunto, docs,
    recibidoEl: recibido && !Number.isNaN(recibido.getTime()) ? recibido.toISOString() : null,
    fechaLimite: limite.toISOString(),
    avisarDias,
    notas: String(body.notas ?? "").trim().slice(0, 1000) || null,
    creadoPor: autor,
    updatedAt: new Date().toISOString(),
  }).select("id, asunto, fechaLimite, avisarDias, estado").single();

  if (error) {
    return NextResponse.json({ error: falta(error.message) ? "Falta la migración: ejecuta supabase/requerimientos.sql en Supabase." : error.message }, { status: 500 });
  }

  // Rastro en el historial del expediente: quien lo abra mañana ve que hubo un plazo.
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO", userId: user.id,
    descripcion: `📨 Requerimiento registrado: ${asunto} · plazo ${limite.toLocaleDateString("es-ES")}`,
  });

  return NextResponse.json({ ok: true, requerimiento: fila });
}
