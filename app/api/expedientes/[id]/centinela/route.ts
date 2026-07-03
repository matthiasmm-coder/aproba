import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revisarExpediente } from "@/lib/centinela";

// EL FUNCIONARIO FANTASMA — lanza la revisión «como Extranjería» del expediente.
// Autorización: el expediente se resuelve BAJO SESIÓN (RLS) antes de usar el admin
// (anti-IDOR, mismo patrón que el resto de rutas del gestor).
// La revisión llama a Claude (~8-15 s) → maxDuration amplio.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  try {
    const r = await revisarExpediente(admin, id);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, revision: r.revision });
  } catch (e) {
    console.error("[centinela]", e instanceof Error ? e.message : e);
    // 429/529 de la API de Claude → saturación temporal, distinta de un fallo nuestro.
    const st = (e as { status?: number }).status;
    if (st === 429 || st === 529) {
      return NextResponse.json({ error: "La IA está saturada en este momento. Espera unos segundos y reinténtalo." }, { status: 503 });
    }
    return NextResponse.json({ error: "La revisión ha fallado. Vuelve a intentarlo." }, { status: 502 });
  }
}
