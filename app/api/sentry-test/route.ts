import { NextResponse } from "next/server";

// Route de TEST Sentry — TEMPORAIRE, à supprimer après vérification.
// GET ?run=1 lève une erreur volontaire (capturée par onRequestError → Sentry).
export function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("run") === "1") {
    throw new Error("Sentry test error — aproba beta check");
  }
  return NextResponse.json({ ok: true, hint: "añade ?run=1 para lanzar un error de prueba" });
}
