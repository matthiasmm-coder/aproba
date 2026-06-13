import { createServerClient } from "@supabase/ssr";
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
