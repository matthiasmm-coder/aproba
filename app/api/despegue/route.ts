import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchPrefillDespegue } from "@/lib/data/despegue";

// GET: datos de la sesión para prellenar el presupuesto de Aproba Despegue (guía, al terminar).
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json(await fetchPrefillDespegue(supabase), { headers: { "Cache-Control": "no-store" } });
}
