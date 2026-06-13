import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { FacturaView } from "@/components/factura-view";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await fetchFactura(id);
  if (!f) notFound();
  return <FacturaView f={f} />;
}
