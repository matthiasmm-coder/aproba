import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// ⚠️ RUTA DE PRUEBA TEMPORAL — verificar que Sentry recibe eventos en prod.
// Protegida por CRON_SECRET (?key=) para que nadie la dispare al azar.
// Lanza un error controlado, lo captura explícitamente y hace flush antes de responder
// (en serverless el proceso puede terminar antes de que Sentry envíe el evento).
// BORRAR tras confirmar que aparece en Sentry.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const dsn = Boolean(process.env.SENTRY_DSN);
  const err = new Error(`Sentry test — ${new Date().toISOString()} (ruta de prueba, ignorar)`);
  const eventId = Sentry.captureException(err);
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    dsnConfigurado: dsn,
    eventId: eventId ?? null,
    nota: dsn
      ? "Evento enviado a Sentry. Búscalo en Issues. Luego borra esta ruta."
      : "SENTRY_DSN NO está configurada en este entorno → el evento no se ha enviado.",
  });
}
