import { NextResponse } from "next/server";

// Inscription NORMALE (bouton vert « Empieza gratis ») : essai 15 jours AVEC carte.
// On EFFACE le cookie « testeur » éventuellement posé par /prueba, sinon le parcours
// hériterait du mode testeur (1 mois sans carte) tant que le cookie n'a pas expiré.
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/signup", req.url));
  res.cookies.set("aproba.modo", "", { path: "/", maxAge: 0 });
  return res;
}
