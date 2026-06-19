import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FacturaView, type Emisor } from "@/components/factura-view";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await fetchFactura(id);
  if (!f) notFound();

  // Émetteur = le vrai despacho de l'utilisateur (table Workspace), plus de données de démo.
  const supabase = await createSupabaseServer();
  const { data: mem } = await supabase.from("Membership").select("Workspace(nombre, nif)").limit(1).maybeSingle();
  const wsRaw = (mem as { Workspace?: { nombre?: string; nif?: string | null } | { nombre?: string; nif?: string | null }[] } | null)?.Workspace;
  const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
  const emisor: Emisor = { nombre: ws?.nombre ?? "Mi despacho", nif: ws?.nif ?? null };

  return <FacturaView f={f} emisor={emisor} />;
}
