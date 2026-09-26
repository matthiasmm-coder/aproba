import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { construirAlertas } from "@/lib/alertas";

// La campana del encabezado (components/campana-alertas.tsx). Lectura BAJO SESIÓN: la RLS
// deja a cada gestor lo de sus sedes y a la administración todo el despacho — por eso no se
// pasa la sede de la pastilla: una alerta no se esconde porque se esté mirando otra oficina.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const [reqs, vencs] = await Promise.all([
    fetchRequerimientosPendientes().catch(() => []),
    fetchVencimientos().catch(() => []),
  ]);
  return NextResponse.json({ alertas: construirAlertas(reqs, vencs) }, { headers: { "Cache-Control": "no-store" } });
}
