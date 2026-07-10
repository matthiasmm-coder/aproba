import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { P2_OPCIONES } from "@/lib/ex-forms";

// Persiste la casilla de trámite de la p.2 elegida por el gestor (selector de la página
// Formularios) para que TODOS los canales (descarga, export ZIP, portal del cliente)
// rellenen la misma. Sesión + RLS anti-IDOR. valor null/"" = volver al automático.
// Fail-soft si falta la migración supabase/p2-overrides.sql (el selector sigue actuando
// por descarga vía query param, simplemente sin memoria).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { code?: string; valor?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  const valor = (body.valor ?? "").trim();
  if (!code || !P2_OPCIONES[code]) return NextResponse.json({ error: "Modelo sin casilla p.2." }, { status: 400 });
  if (valor && !P2_OPCIONES[code].some((o) => o.value === valor)) {
    return NextResponse.json({ error: "Valor no válido." }, { status: 400 });
  }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia bajo RLS + estado actual del override (columna puede faltar → repli).
  let actuales: Record<string, string> = {};
  const { data: exp, error: eSel } = await supa.from("Expediente").select("id, p2Overrides").eq("id", id).maybeSingle();
  if (eSel) {
    const { data: exp2 } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
    if (!exp2) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, persistido: false }); // sin migración: no-op amable
  }
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  if (exp.p2Overrides && typeof exp.p2Overrides === "object") actuales = exp.p2Overrides as Record<string, string>;

  if (valor) actuales[code] = valor; else delete actuales[code];

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente")
    .update({ p2Overrides: Object.keys(actuales).length ? actuales : null, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, persistido: true });
}
