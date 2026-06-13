import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient, type DashItem } from "@/components/dashboard-client";

export const metadata = { title: "Inicio" };

// Dashboard branché sur Supabase (RLS).
export default async function Dashboard() {
  const supabase = await createSupabaseServer();
  const [{ data: { user } }, expedientes] = await Promise.all([
    supabase.auth.getUser(),
    fetchExpedientesResumen(),
  ]);
  const usuario = (user?.user_metadata?.nombre as string) || user?.email || undefined;
  const items: DashItem[] = expedientes.map((e) => ({
    id: e.id,
    clienteNombre: e.clienteNombre,
    tipoLabel: e.tipoLabel,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
  }));
  return <DashboardClient items={items} usuario={usuario} />;
}
