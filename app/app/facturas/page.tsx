import { fetchFacturas, fetchCobrosPendientes } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { puedeGestionarEquipo } from "@/lib/planes";
import { FacturasClient } from "@/components/facturas-client";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";

export const metadata = { title: "Facturas" };

// Rol del usuario en su workspace → solo un administrador puede ELIMINAR facturas.
async function esAdminActual(): Promise<boolean> {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return false;
  // El botón Eliminar se muestra si el usuario es admin en ALGUNO de sus workspaces; el gate
  // real del DELETE valida el rol sobre EL workspace de la factura concreta (route.ts).
  const { data: mems } = await supa.from("Membership").select("role").eq("userId", user.id);
  return ((mems ?? []) as { role?: string }[]).some((m) => puedeGestionarEquipo(m.role));
}

// Facturación branchée sur Supabase (RLS).
export default async function Facturas() {
  // multi-oficina : les facturas estampillées suivent leur sede ; les non estampillées
  // (manuelles, antérieures à la fase 6) comptent pour la gestoría — jamais masquées
  // en vue « Todas ». Le tampon existe depuis la fase 6, le filtre devient possible.
  const filtroSede = await resolverOficina().catch(() => ({ activa: null, oficinas: [], miOficina: null, autoId: null, sedes: null, incluirSinSede: false }));
  const [facturas, cobros, despacho, esAdmin] = await Promise.all([
    fetchFacturas(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchCobrosPendientes(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchDespacho(),
    esAdminActual(),
  ]);
  return (
    <div>
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <FacturasClient facturas={facturas} cobros={cobros} despacho={despacho} esAdmin={esAdmin} />
    </div>
  );
}
