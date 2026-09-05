import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchDatosActivacion } from "@/lib/data/activacion";

// Estado de activación del despacho, para la guía interactiva (components/guia-activacion).
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await fetchDatosActivacion(supabase), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado." }, { status: 500 });
  }
}
