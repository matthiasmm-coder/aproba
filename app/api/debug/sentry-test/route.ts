import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// ⚠️ RUTA DE PRUEBA TEMPORAL — verificar que Sentry recibe eventos en prod.
// Protegida por un NONCE de usar y tirar (no es ningún secreto real: solo abre esta
// ruta desechable, así nunca ponemos una credencial de verdad en una URL). Lanza un
// error controlado, lo captura y hace flush antes de responder (en serverless el
// proceso puede terminar antes de que Sentry envíe el evento).
// BORRAR esta ruta tras confirmar que el evento aparece en Sentry.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE = "37ddabaa78db2341"; // desechable; se va con la ruta

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== NONCE) {
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
