import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchProximasCitas, fetchClientesMin } from "@/lib/data/citas";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient, type DashItem } from "@/components/dashboard-client";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { construirChecklist, esperandoAlCliente, MARCA_ENLACE, MARCA_SUBIDA_CLIENTE, type ChecklistItem } from "@/lib/activacion";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Inicio" };

// État d'avancement de la configuration du despacho (pour la checklist du dashboard).
async function fetchChecklist(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, t: (s: string) => string): Promise<{ items: ChecklistItem[]; esperando: boolean }> {
  try {
    const cnt = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true });
    // El diario lleva su propia RLS (evt_tenant): filtra por despacho sin pasarle ids.
    const evento = (marca: string) =>
      supabase.from("ExpedienteEvento").select("id", { count: "exact", head: true }).like("descripcion", `%${marca}%`);
    const [svc, cta, cli, mem, sub, exp, enlaces, subidas] = await Promise.all([
      cnt("ServicioConfig"), cnt("CuentaBancaria"), cnt("Cliente"), cnt("Membership"),
      supabase.from("Subscription").select("plan").limit(1).maybeSingle(),
      cnt("Expediente"), evento(MARCA_ENLACE), evento(MARCA_SUBIDA_CLIENTE),
    ]);
    const datos = {
      clientes: cli.count ?? 0, expedientes: exp.count ?? 0,
      enlacesEnviados: enlaces.count ?? 0, subidasDeCliente: subidas.count ?? 0,
      servicios: svc.count ?? 0, cuentas: cta.count ?? 0, miembros: mem.count ?? 0,
      plan: (sub.data as { plan?: string } | null)?.plan ?? "STARTER",
    };
    return { items: construirChecklist(datos, t), esperando: esperandoAlCliente(datos) };
  } catch {
    return { items: [], esperando: false };
  }
}

// Dashboard branché sur Supabase (RLS).
export default async function Dashboard() {
  const t = await getT();
  const supabase = await createSupabaseServer();
  // Sede regardée : filtre les KPI et le travail du jour. La checklist d'onboarding
  // reste au niveau du DESPACHO — « crea tu primer expediente » ne doit pas se
  // décocher parce qu'on regarde une sede qui vient d'ouvrir.
  const filtroSede = await resolverOficina().catch(() => ({ activa: null, oficinas: [], miOficina: null, autoId: null, sedes: null, incluirSinSede: false }));
  const activa = filtroSede.activa;
  const [{ data: { user } }, expedientes, checklist, citas, clientes, vencimientos] = await Promise.all([
    supabase.auth.getUser(),
    fetchExpedientesResumen(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchChecklist(supabase, t),
    // Agenda semanal: 90 días hacia atrás para poder navegar a semanas pasadas.
    fetchProximasCitas({ desdeDias: 90, max: 300 }),
    fetchClientesMin(),
    fetchVencimientos(filtroSede.sedes, filtroSede.incluirSinSede), // KPI «Caducan pronto» (Vigía visible desde Inicio)
  ]);
  const usuario = (user?.user_metadata?.nombre as string) || user?.email || undefined;

  // Equipo para la «Carga del equipo»: la carga mostrada debe depender de la sede
  // mirada — en «Oficina Barcelona» solo los miembros DE Barcelona (con su 0 si no
  // llevan nada), no los de Zaragoza. Los admins no están anclados: aparecen solo
  // si llevan carga en la vista. RLS enseña todas las membresías del despacho.
  let equipo: { nombre: string; esAdmin: boolean; sedes: string[] }[] = [];
  try {
    let res = await supabase.from("Membership").select("role, oficinaId, oficinaIds, user:User(nombre)");
    if (res.error) res = await supabase.from("Membership").select("role, oficinaId, user:User(nombre)") as typeof res;
    equipo = (res.data ?? []).flatMap((m) => {
      const fila = m as { role?: string; oficinaId?: string | null; oficinaIds?: string[] | null; user?: { nombre: string | null } | { nombre: string | null }[] | null };
      const u = Array.isArray(fila.user) ? fila.user[0] : fila.user;
      if (!u?.nombre) return [];
      return [{
        nombre: u.nombre,
        esAdmin: fila.role === "OWNER" || fila.role === "ADMIN",
        sedes: fila.oficinaIds?.length ? fila.oficinaIds : fila.oficinaId ? [fila.oficinaId] : [],
      }];
    });
  } catch { equipo = []; }
  const sedesVista = activa ? [activa] : filtroSede.sedes;
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
      {/* La checklist n'est PAS filtrée par sede (piège connu) — les pastillas ne
          gouvernent que les KPI et listes en dessous. */}
      <OnboardingChecklist items={checklist.items} esperandoAlCliente={checklist.esperando} />
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <DashboardClient items={items} usuario={usuario} citas={citas} clientes={clientes} equipo={equipo} sedesVista={sedesVista} caducanPronto={caducanPronto} caducadas={caducadas} hoy={new Date().toISOString().slice(0, 10)} />
    </>
  );
}
