import { ClientPortal } from "@/components/client-portal";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";

// Los enlaces del portal llevan el token en la URL: nunca deben indexarse.
export const metadata = { robots: { index: false, follow: false } };

// Sin esto la página se PRERRENDERIZA en el deploy (x-nextjs-prerender) y la demo
// enseña la config de servicios congelada del último build, no la de Ajustes.
export const dynamic = "force-dynamic";


// Aperçu du portail client (démo) — même config réelle que /j/[token].
export default async function PortalPage() {
  let servicios: Servicio[] = DEFAULT_SERVICIOS;
  try {
    const admin = createSupabaseAdmin();
    const { data: ws } = await admin.from("Workspace").select("id").eq("nombre", "Gestoría Vallès").limit(1).maybeSingle();
    if (ws) servicios = await fetchServiciosDeWorkspace(admin, ws.id);
  } catch {
    /* fallback defaults */
  }
  return <ClientPortal servicios={servicios} />;
}
