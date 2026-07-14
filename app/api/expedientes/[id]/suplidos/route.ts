import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// El gestor ajusta las tasas y suplidos de ESTE expediente (p. ej. el TIE 16,08 € en vez
// del 12 € por defecto). Se guardan en Expediente.suplidosOverride y alimentan la hoja de
// encargo, la primera factura y el presupuesto del portal. Sesión + RLS (anti-IDOR).
//   body.suplidos = [{concepto, importe}]  → override
//   body.suplidos = null                    → volver a los del servicio
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { suplidos?: { concepto?: unknown; importe?: unknown }[] | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del gestor.
  const { data: exp, error: eSel } = await supa.from("Expediente").select("id, suplidosOverride").eq("id", id).maybeSingle();
  if (eSel) {
    const falta = /suplidosOverride|schema cache|column/i.test(eSel.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/expediente-suplidos.sql en Supabase." : eSel.message }, { status: falta ? 409 : 500 });
  }
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // El body DEBE traer suplidos = null (limpiar override → los del servicio) o un array
  // (lista saneada). Ausente/otro tipo → 400 (no vaciar tasas por un body mal formado).
  if (body.suplidos !== null && !Array.isArray(body.suplidos)) {
    return NextResponse.json({ error: "Falta la lista de suplidos (o null)." }, { status: 400 });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const valor = body.suplidos === null
    ? null
    : body.suplidos
        .map((x) => ({ concepto: String(x?.concepto ?? "").trim(), importe: r2(Number(x?.importe) || 0) }))
        .filter((x) => x.concepto && x.importe > 0);

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Expediente").update({ suplidosOverride: valor, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) {
    const falta = /suplidosOverride|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/expediente-suplidos.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
  }

  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: valor === null
      ? "Tasas y suplidos: se usan los del servicio"
      : valor.length === 0
        ? "Tasas y suplidos: sin tasas ni suplidos para este expediente (0 €)"
        : `Tasas y suplidos ajustados: ${valor.map((x) => `${x.concepto} ${eur(x.importe)}`).join(", ")}`,
    userId: user.id,
  });

  return NextResponse.json({ ok: true });
}
