import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchDespacho } from "@/lib/data/config";
import { fetchProforma } from "@/lib/data/proformas";
import { ProformaView } from "@/components/proforma-view";
import type { Emisor } from "@/components/factura-view";

export const metadata = { title: "Factura proforma" };
export const dynamic = "force-dynamic";

// FACTURA PROFORMA (29/09/2026): el documento y sus acciones (components/proforma-view.tsx).
// El emisor se resuelve como en la ficha de una factura: el de la oficina si factura con su
// NIF, y el congelado al crearla manda sobre el vivo.
export default async function ProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, d] = await Promise.all([fetchProforma(id), fetchDespacho()]);
  if (!p) notFound();

  let emisor: Emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl };
  const supa = await createSupabaseServer();
  try {
    const { fiscalDeOficina, emisorDesdeFiscal } = await import("@/lib/facturacion-oficina");
    if (p.oficinaId) {
      const fiscal = await fiscalDeOficina(supa, p.oficinaId);
      const em = emisorDesdeFiscal({ nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion }, fiscal);
      const logoSede = (fiscal?.logoUrl ?? "").trim() || d.logoUrl;
      if (em.deOficina) emisor = { nombre: em.nombre, nif: em.nif, domicilio: em.domicilio, email: em.email, logo: logoSede };
      else if (logoSede !== d.logoUrl) emisor = { ...emisor, logo: logoSede };
    }
  } catch { /* migración multi-oficina ausente → emisor del despacho */ }
  if (p.emisorDatos) {
    const { conEmisorFijado } = await import("@/lib/facturacion-oficina");
    emisor = { ...conEmisorFijado({ ...emisor, nif: emisor.nif ?? null, domicilio: emisor.domicilio ?? null, email: emisor.email ?? null }, p.emisorDatos), logo: emisor.logo };
  }

  // Email del cliente para «Enviar al cliente» (el gestor puede cambiarlo).
  let emailCliente: string | null = null;
  if (p.clienteId) {
    const { data } = await supa.from("Cliente").select("email").eq("id", p.clienteId).maybeSingle();
    emailCliente = ((data as { email?: string | null } | null)?.email ?? "").trim() || null;
  }

  return <ProformaView p={p} emisor={emisor} emailCliente={emailCliente} />;
}
