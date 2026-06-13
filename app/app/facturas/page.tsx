import { fetchFacturas } from "@/lib/data/facturas";
import { FacturasClient } from "@/components/facturas-client";

export const metadata = { title: "Facturas" };

// Facturación branchée sur Supabase (RLS).
export default async function Facturas() {
  const facturas = await fetchFacturas();
  return <FacturasClient facturas={facturas} />;
}
