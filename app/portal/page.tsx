import { ClientPortal } from "@/components/client-portal";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";

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
