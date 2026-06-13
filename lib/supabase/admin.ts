import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client admin (service_role) — BYPASS le RLS. À n'utiliser QUE côté serveur, pour
// des opérations de confiance (webhooks Stripe, tâches système). Jamais importé
// dans un Client Component. L'import "server-only" fait échouer le build si on le tente.
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
