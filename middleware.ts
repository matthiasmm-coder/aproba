import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { reclamosDeSesion } from "@/lib/supabase/claims";

// Rafraîchit la session Supabase (cookies) et protège l'app :
//  • /app/** et /onboarding sans session → /login
//  • /login et /signup avec session → /app
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims() et non getUser() (29/09/2026, logs Supabase) : getUser() interrogeait le
  // serveur Auth à CHAQUE requête /app, préchargements de liens compris (~2 900 appels/jour,
  // le 1er poste des logs). getClaims() rafraîchit la session exactement pareil (même
  // getSession interne, mêmes cookies réécrits) puis vérifie la signature du JWT en local,
  // avec la clé publique du projet (ES256, JWKS mis en cache 10 min). Les pages et les
  // routes gardent leur getUser() : la révocation d'une session y reste contrôlée.
  // Toute erreur (JWT falsifié, illisible…) = pas de session, comme avant : lib/supabase/claims.ts.
  const user = await reclamosDeSesion(supabase);
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/app") || path.startsWith("/onboarding"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/login", "/signup"],
};
