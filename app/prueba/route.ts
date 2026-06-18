import { NextResponse } from "next/server";

// Compat héritage (anciens liens / landing en cache du bouton violet).
// Simple redirection vers /signup?modo=prueba — AUCUN effet de bord (c'est le
// formulaire /signup qui pose seul le cookie), donc safe même si une vieille
// landing en cache la précharge en <Link>.
export function GET(req: Request) {
  return NextResponse.redirect(new URL("/signup?modo=prueba", req.url));
}
