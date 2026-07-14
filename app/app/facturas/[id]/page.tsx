import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { puedeGestionarEquipo } from "@/lib/planes";
import { FacturaView, type Emisor } from "@/components/factura-view";

async function esAdminActual(): Promise<boolean> {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return false;
  // El botón Eliminar se muestra si el usuario es admin en ALGUNO de sus workspaces; el gate
  // real del DELETE valida el rol sobre EL workspace de la factura concreta (route.ts).
  const { data: mems } = await supa.from("Membership").select("role").eq("userId", user.id);
  return ((mems ?? []) as { role?: string }[]).some((m) => puedeGestionarEquipo(m.role));
}

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [f, d, esAdmin] = await Promise.all([fetchFactura(id), fetchDespacho(), esAdminActual()]);
  if (!f) notFound();

  // Émetteur = le vrai despacho de l'utilisateur (nom, NIF, domicilio, email de facturación).
  const emisor: Emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl };

  return <FacturaView f={f} emisor={emisor} editable esAdmin={esAdmin} />;
}
