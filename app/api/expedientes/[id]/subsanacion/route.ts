import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { redactarSubsanacion, type Hallazgo } from "@/lib/centinela";

// EL FUNCIONARIO FANTASMA — redacta el borrador de escrito de subsanación/aportación,
// a partir de los hallazgos de la última revisión o del texto de un requerimiento
// real recibido (pegado por el gestor). Es un BORRADOR: lo firma y presenta el gestor.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { hallazgos?: Hallazgo[]; requerimientoTexto?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  try {
    const r = await redactarSubsanacion(admin, id, {
      hallazgos: Array.isArray(body.hallazgos) ? body.hallazgos.slice(0, 25) : undefined,
      requerimientoTexto: typeof body.requerimientoTexto === "string" ? body.requerimientoTexto : undefined,
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, escrito: r.escrito });
  } catch (e) {
    console.error("[subsanacion]", e instanceof Error ? e.message : e);
    const st = (e as { status?: number }).status;
    if (st === 429 || st === 529) {
      return NextResponse.json({ error: "La IA está saturada en este momento. Espera unos segundos y reinténtalo." }, { status: 503 });
    }
    return NextResponse.json({ error: "La redacción ha fallado. Vuelve a intentarlo." }, { status: 502 });
  }
}
