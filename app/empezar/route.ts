import { NextResponse } from "next/server";

// Compat héritage (anciens liens / landing en cache du bouton vert).
// Simple redirection vers /signup (sans paramètre) — AUCUN effet de bord ; le
// formulaire /signup efface lui-même le cookie testeur. Safe au préchargement.
export function GET(req: Request) {
  return NextResponse.redirect(new URL("/signup", req.url));
}
