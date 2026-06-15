import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient, type DashItem } from "@/components/dashboard-client";
import { OnboardingChecklist, type ChecklistItem } from "@/components/onboarding-checklist";

export const metadata = { title: "Inicio" };

// État d'avancement de la configuration du despacho (pour la checklist du dashboard).
async function fetchChecklist(supabase: Awaited<ReturnType<typeof createSupabaseServer>>): Promise<ChecklistItem[]> {
  try {
    const cnt = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true });
    const [svc, cta, cli, mem, sub] = await Promise.all([
      cnt("ServicioConfig"), cnt("CuentaBancaria"), cnt("Cliente"), cnt("Membership"),
      supabase.from("Subscription").select("plan").limit(1).maybeSingle(),
    ]);
    const plan = (sub.data as { plan?: string } | null)?.plan ?? "STARTER";
    const items: ChecklistItem[] = [
      { key: "servicios", label: "Configura tus servicios", href: "/app/ajustes", done: (svc.count ?? 0) > 0 },
      { key: "banco", label: "Añade tu cuenta bancaria", href: "/app/ajustes", done: (cta.count ?? 0) > 0 },
      { key: "clientes", label: "Importa tus clientes", href: "/app/clientes/nuevo", done: (cli.count ?? 0) > 0 },
    ];
    if (plan !== "STARTER") items.push({ key: "equipo", label: "Invita a tu equipo", href: "/app/ajustes", done: (mem.count ?? 0) > 1 });
    return items;
  } catch {
    return [];
  }
}

// Dashboard branché sur Supabase (RLS).
export default async function Dashboard() {
  const supabase = await createSupabaseServer();
  const [{ data: { user } }, expedientes, checklist] = await Promise.all([
    supabase.auth.getUser(),
    fetchExpedientesResumen(),
    fetchChecklist(supabase),
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
  return (
    <>
      <OnboardingChecklist items={checklist} />
      <DashboardClient items={items} usuario={usuario} />
    </>
  );
}
