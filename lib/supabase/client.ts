import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (Client Components). Respecte le RLS via le JWT
// de l'utilisateur connecté. À n'appeler que dans des composants "use client".
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
