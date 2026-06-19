import { fetchFacturas } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { FacturasClient } from "@/components/facturas-client";

export const metadata = { title: "Facturas" };

// Facturación branchée sur Supabase (RLS).
export default async function Facturas() {
  const [facturas, despacho] = await Promise.all([fetchFacturas(), fetchDespacho()]);
  return <FacturasClient facturas={facturas} despacho={despacho} />;
}
