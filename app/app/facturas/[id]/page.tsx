import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { FacturaView, type Emisor } from "@/components/factura-view";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await fetchFactura(id);
  if (!f) notFound();

  // Émetteur = le vrai despacho de l'utilisateur (nom, NIF, domicilio, email de facturación).
  const d = await fetchDespacho();
  const emisor: Emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl };

  return <FacturaView f={f} emisor={emisor} />;
}
