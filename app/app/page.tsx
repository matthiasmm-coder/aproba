import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchProximasCitas, fetchClientesMin } from "@/lib/data/citas";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient, type DashItem } from "@/components/dashboard-client";
import { OnboardingChecklist, type ChecklistItem } from "@/components/onboarding-checklist";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Inicio" };

// État d'avancement de la configuration du despacho (pour la checklist du dashboard).
async function fetchChecklist(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, t: (s: string) => string): Promise<ChecklistItem[]> {
  try {
    const cnt = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true });
    const [svc, cta, cli, mem, sub, exp, expEnviado] = await Promise.all([
      cnt("ServicioConfig"), cnt("CuentaBancaria"), cnt("Cliente"), cnt("Membership"),
      supabase.from("Subscription").select("plan").limit(1).maybeSingle(),
      cnt("Expediente"),
      // «enlace enviado» ≈ un expediente que ya salió de BORRADOR (el cliente entró al portal)
      supabase.from("Expediente").select("id", { count: "exact", head: true }).neq("estado", "BORRADOR"),
    ]);
    const plan = (sub.data as { plan?: string } | null)?.plan ?? "STARTER";
    const items: ChecklistItem[] = [
      { key: "servicios", label: t("Configura tus servicios"), href: "/app/ajustes", done: (svc.count ?? 0) > 0 },
      { key: "banco", label: t("Añade tu cuenta bancaria"), href: "/app/ajustes", done: (cta.count ?? 0) > 0 },
      { key: "clientes", label: t("Importa tus clientes"), href: "/app/clientes/nuevo", done: (cli.count ?? 0) > 0 },
      // El camino crítico hasta el primer valor real: expediente creado + cliente dentro.
      { key: "expediente", label: t("Crea tu primer expediente"), href: "/app/expedientes/nuevo", done: (exp.count ?? 0) > 0 },
      { key: "enlace", label: t("Envía el enlace a tu cliente"), href: "/app/expedientes", done: (expEnviado.count ?? 0) > 0 },
    ];
    if (plan !== "STARTER") items.push({ key: "equipo", label: t("Invita a tu equipo"), href: "/app/ajustes", done: (mem.count ?? 0) > 1 });
    return items;
  } catch {
    return [];
  }
}

// Dashboard branché sur Supabase (RLS).
export default async function Dashboard() {
  const t = await getT();
  const supabase = await createSupabaseServer();
  const [{ data: { user } }, expedientes, checklist, citas, clientes, vencimientos] = await Promise.all([
    supabase.auth.getUser(),
    fetchExpedientesResumen(),
    fetchChecklist(supabase, t),
    fetchProximasCitas(),
    fetchClientesMin(),
    fetchVencimientos(), // KPI «Caducan pronto» (Vigía visible desde Inicio)
  ]);
  const usuario = (user?.user_metadata?.nombre as string) || user?.email || undefined;
  const items: DashItem[] = expedientes.map((e) => ({
    id: e.id,
    clienteNombre: e.clienteNombre,
    tipoLabel: e.tipoLabel,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
    fechaLimiteISO: e.fechaLimiteISO,
    archivado: e.archivado,
  }));
  const proximos = vencimientos.filter((v) => v.estado !== "TRAMITANDO");
  const caducanPronto = proximos.filter((v) => v.dias <= 60).length;
  const caducadas = proximos.filter((v) => v.dias < 0).length;
  return (
    <>
      <OnboardingChecklist items={checklist} />
      <DashboardClient items={items} usuario={usuario} citas={citas} clientes={clientes} caducanPronto={caducanPronto} caducadas={caducadas} />
    </>
  );
}
