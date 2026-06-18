import { NextResponse } from "next/server";

// Entrée « essai testeur 1 mois sans carte » (bouton violet de la landing).
// Pose un cookie qui marque le parcours d'inscription comme essai testeur, puis
// redirige vers /signup. L'onboarding lit ce cookie → 30 jours, sans carte.
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/signup", req.url));
  res.cookies.set("aproba.modo", "prueba", { path: "/", maxAge: 3600, sameSite: "lax" });
  return res;
}
