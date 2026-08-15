import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { completarClienteDatosFacturas } from "@/lib/factura-datos-backfill";
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
  // Factura emitida ANTES del snapshot fiscal → se completa desde el cliente del
  // expediente y queda CONGELADA (pedido de Juan: las antiguas también con datos).
  if (f && !f.clienteDatos) {
    const m = await completarClienteDatosFacturas([f.id]);
    if (m.has(f.id)) f.clienteDatos = m.get(f.id)!;
  }
  if (!f) notFound();

  // Émetteur : la SEDE de la factura si elle a une identité fiscale propre (fase 6),
  // sinon le despacho. La sede vient du tampon, ou de l'expediente pour les anciennes.
  let emisor: Emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl };
  try {
    const supa = await createSupabaseServer();
    const { oficinaDeFacturaFila, fiscalDeOficina, emisorDesdeFiscal } = await import("@/lib/facturacion-oficina");
    const sede = await oficinaDeFacturaFila(supa, { oficinaId: f.oficinaId ?? null, expedienteId: f.expedienteId ?? null });
    if (sede) {
      const fiscal = await fiscalDeOficina(supa, sede);
      const em = emisorDesdeFiscal({ nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion }, fiscal);
      const logoSede = (fiscal?.logoUrl ?? "").trim() || d.logoUrl;
      if (em.deOficina) emisor = { nombre: em.nombre, nif: em.nif, domicilio: em.domicilio, email: em.email, logo: logoSede };
      else if (logoSede !== d.logoUrl) emisor = { ...emisor, logo: logoSede };
    }
  } catch { /* migración fase 6 ausente → emisor del despacho */ }

  return <FacturaView f={f} emisor={emisor} editable esAdmin={esAdmin} />;
}
