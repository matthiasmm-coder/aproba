import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sonde de salud para el monitoring externo: comprueba que la app responde Y que
// la base de datos es alcanzable. 200 = todo bien; 503 = base caída (la sonda
// distingue así «Vercel caído» de «Supabase caído»). Sin datos sensibles.
export async function GET() {
  const t0 = Date.now();
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("Workspace").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, db: "up", ms: Date.now() - t0 });
  } catch (e) {
    console.error("[health] db check falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, db: "down", ms: Date.now() - t0 }, { status: 503 });
  }
}
