import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Client Supabase côté serveur (Server Components, Route Handlers, Server Actions).
// Respecte le RLS via la session de l'utilisateur (cookies). Next.js 15 : cookies() est async.
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : ignoré (le middleware rafraîchit la session).
          }
        },
      },
    },
  );
}

// L'utilisateur connecté, UNE fois par rendu serveur (29/09/2026, logs Supabase).
// Le layout, la page et les fetchers (resolverOficina…) appelaient chacun
// auth.getUser() : autant d'allers-retours vers le serveur Auth pour un seul écran.
// cache() de React mémorise le résultat le temps d'une requête de rendu ; hors rendu
// (route handlers), il ne mémorise rien et l'appel se fait comme avant. Même contrôle
// qu'avant (getUser : session vérifiée côté serveur Auth), une seule fois.
export const usuarioActual = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
