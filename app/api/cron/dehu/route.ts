import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { despachosConDehu, sincronizarDehu } from "@/lib/dehu/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// DEHú AUTOMÁTICA — la consulta de cada mañana, para los despachos con la DEHú conectada
// (el resto del día la dispara la campana al usar la app, lib/dehu/sincronizar.ts). Usa
// certificados: SIN CRON_SECRET no se ejecuta.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const inicio = Date.now();
  const resultados: Record<string, unknown> = {};
  for (const ws of await despachosConDehu(admin)) {
    if (Date.now() - inicio > 45_000) { resultados[ws] = "sin tiempo: mañana, o al entrar en la app"; continue; }
    try { resultados[ws] = await sincronizarDehu(admin, ws, { forzar: false }); }
    catch (e) { resultados[ws] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return NextResponse.json({ ok: true, resultados });
}
