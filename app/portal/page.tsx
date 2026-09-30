import { ClientPortal } from "@/components/client-portal";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchPacksDeWorkspace, fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DEFAULT_SERVICIOS, type Pack, type Servicio } from "@/lib/servicios";

// Los enlaces del portal llevan el token en la URL: nunca deben indexarse. Título y descripción
// propios: sin ellos, esta demo repetía los de la portada.
export const metadata = {
  title: "Portal del cliente: vista de demostración",
  description: "Vista de demostración del portal donde el cliente de un despacho sube sus documentos y sigue su expediente.",
  robots: { index: false, follow: false },
};

// Sin esto la página se PRERRENDERIZA en el deploy (x-nextjs-prerender) y la demo
// enseña la config de servicios congelada del último build, no la de Ajustes.
export const dynamic = "force-dynamic";


// Aperçu du portail client (démo) — même config réelle que /j/[token].
export default async function PortalPage() {
  let servicios: Servicio[] = DEFAULT_SERVICIOS;
  let packs: Pack[] = [];
  try {
    const admin = createSupabaseAdmin();
    const { data: ws } = await admin.from("Workspace").select("id").eq("nombre", "Gestoría Vallès").limit(1).maybeSingle();
    if (ws) {
      servicios = await fetchServiciosDeWorkspace(admin, ws.id);
      packs = await fetchPacksDeWorkspace(admin, ws.id);
    }
  } catch {
    /* fallback defaults */
  }
  return <ClientPortal servicios={servicios} packs={packs} />;
}
