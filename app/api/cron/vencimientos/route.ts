import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { escanearVencimientos } from "@/lib/vencimientos";

// VIGÍA — escaneo de vencimientos bajo demanda. El tick diario real vive en
// /api/cron/reconciliar-pagos (Vercel Hobby limita el nº de crons; compartimos la
// invocación). Esta ruta existe para pruebas manuales y para separar el cron el día
// que el plan lo permita. FAIL-CLOSED, solo header (mismo patrón que los demás crons).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): "ok" | "sin-secret" | "no" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "sin-secret";
  return req.headers.get("authorization") === `Bearer ${secret}` ? "ok" : "no";
}

export async function GET(req: Request) {
  const auth = autorizado(req);
  if (auth === "sin-secret") return NextResponse.json({ error: "CRON_SECRET no configurada — cron desactivado (fail-closed)." }, { status: 503 });
  if (auth === "no") return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const resumen = await escanearVencimientos(createSupabaseAdmin());
  return NextResponse.json(resumen);
}
