import { fetchServiciosConfig, fetchAvisosConfig, fetchCuentasBancarias } from "@/lib/data/config";
import { fetchEquipo } from "@/lib/data/equipo";
import { TIPO_LABEL, planLabel, puedeGestionarEquipo, ROLES } from "@/lib/planes";
import { ServiciosManager } from "@/components/servicios-manager";
import { AvisosManager } from "@/components/avisos-manager";
import { CuentasBancarias } from "@/components/cuentas-bancarias";
import { InstallPWA } from "@/components/install-pwa";
import { EquipoManager } from "@/components/equipo-manager";
import { AjustesSection } from "@/components/ajustes-section";

export const metadata = { title: "Ajustes" };

const IconServicios = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
    <path d="M9 7V5h6v2" />
  </svg>
);

const IconAvisos = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

const IconCuenta = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21V7l9-4 9 4v14" />
    <path d="M9 21v-6h6v6M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01" />
  </svg>
);

const IconEquipo = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default async function Ajustes() {
  // Config réelle du workspace (Supabase, RLS) — defaults si pas encore configuré.
  const [{ servicios }, { avisos }, cuentas, equipo] = await Promise.all([
    fetchServiciosConfig(),
    fetchAvisosConfig(),
    fetchCuentasBancarias().catch(() => []), // table pas encore migrée → liste vide
    fetchEquipo().catch(() => null),
  ]);
  const yo = equipo?.miembros.find((m) => m.esYo);
  const despachoNombre = equipo?.workspace.nombre ?? "Mi despacho";
  const despachoTipo = equipo ? (TIPO_LABEL[equipo.workspace.tipo] ?? equipo.workspace.tipo) : "—";
  const despachoPlan = equipo ? planLabel(equipo.plan) : "Starter";
  // Les ajustes (servicios, avisos, cuentas) ne sont éditables que par un administrador.
  // La RLS l'impose côté base ; ici on désactive l'UI pour éviter les échecs silencieux.
  const puedeEditar = equipo ? puedeGestionarEquipo(equipo.miRol) : true;
  const miRolLabel = equipo ? ROLES[equipo.miRol]?.label ?? equipo.miRol : "";
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">Ajustes</h1>
      <p className="mt-1 text-slate-500">Configura tus servicios, los avisos a tus clientes y los datos de tu despacho.</p>

      {!puedeEditar && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <span>Solo los administradores pueden editar los ajustes. Tu rol ({miRolLabel}) tiene acceso de solo lectura.</span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <AjustesSection
          title="Servicios"
          subtitle="Trámites, pagos y documentos que pide cada uno"
          icon={IconServicios}
        >
          <fieldset disabled={!puedeEditar} className="m-0 border-0 p-0 disabled:opacity-70">
            <ServiciosManager inicial={servicios} />
          </fieldset>
        </AjustesSection>

        <AjustesSection
          title="Notificaciones al cliente"
          subtitle="Avisos automáticos por WhatsApp o email en cada paso"
          icon={IconAvisos}
        >
          <fieldset disabled={!puedeEditar} className="m-0 border-0 p-0 disabled:opacity-70">
            <AvisosManager inicial={avisos} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} />
          </fieldset>
        </AjustesSection>

        {equipo && (
          <AjustesSection
            title="Plan y equipo"
            subtitle={`${despachoPlan} · ${equipo.miembros.length} ${equipo.miembros.length === 1 ? "usuario" : "usuarios"}`}
            icon={IconEquipo}
          >
            <EquipoManager inicial={equipo} />
          </AjustesSection>
        )}

        <AjustesSection
          title="Despacho y cuenta"
          subtitle="Datos de tu gestoría y de tu usuario"
          icon={IconCuenta}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Despacho</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Nombre</span><span className="font-medium text-slate-800">{despachoNombre}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Tipo</span><span className="font-medium text-slate-800">{despachoTipo}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">{despachoPlan}</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Cuenta</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Nombre</span><span className="font-medium text-slate-800">{yo?.nombre ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-medium text-slate-800">{yo?.email ?? "—"}</span></div>
              </div>
            </div>
          </div>

          {/* Instalar como app (PWA) */}
          <div className="mt-4">
            <InstallPWA />
          </div>

          {/* Cuentas bancarias (réception des paiements) — solo administradores:
              datos sensibles, ni siquiera visibles en modo solo lectura. */}
          {puedeEditar ? (
            <CuentasBancarias inicial={cuentas} />
          ) : (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3 text-sm text-slate-500">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span>Las cuentas bancarias solo son accesibles para los administradores.</span>
            </div>
          )}
        </AjustesSection>
      </div>
    </div>
  );
}
