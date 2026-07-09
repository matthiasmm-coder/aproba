import { fetchFacturas, fetchCobrosPendientes } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { FacturasClient } from "@/components/facturas-client";

export const metadata = { title: "Facturas" };

// Facturación branchée sur Supabase (RLS).
export default async function Facturas() {
  const [facturas, cobros, despacho] = await Promise.all([fetchFacturas(), fetchCobrosPendientes(), fetchDespacho()]);
  return <FacturasClient facturas={facturas} cobros={cobros} despacho={despacho} />;
}
