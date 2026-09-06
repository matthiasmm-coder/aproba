import { fetchServiciosConfig, fetchAvisosConfig, fetchCuentasBancarias, fetchDespacho, fetchPacksConfig } from "@/lib/data/config";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { DEFAULT_AVISOS } from "@/lib/avisos";
import { fetchEquipo } from "@/lib/data/equipo";
import { fetchOficinas } from "@/lib/data/oficinas";
import { fetchServiciosDeScope, fetchAvisosDeScope } from "@/lib/data/config";
import { ConfigDeOficina } from "@/components/config-de-oficina";
import { OficinaEncargo } from "@/components/oficina-encargo";
import { TIPO_LABEL, planLabel, puedeGestionarEquipo, ROLES } from "@/lib/planes";
import { ServiciosManager } from "@/components/servicios-manager";
import { AvisosManager } from "@/components/avisos-manager";
import { CuentasBancarias } from "@/components/cuentas-bancarias";
import { FacturacionPorOficina } from "@/components/facturacion-por-oficina";
import { OficinaFacturacion } from "@/components/oficina-facturacion";
import { CobroTarjetaConfig } from "@/components/cobro-tarjeta-config";
import { GoogleCalendarConfig } from "@/components/google-calendar-config";
import { DespachoFacturacion } from "@/components/despacho-facturacion";
import { InstallPWA } from "@/components/install-pwa";
import { EquipoManager } from "@/components/equipo-manager";
import { OficinasManager } from "@/components/oficinas-manager";
import { MemoriaActividad } from "@/components/memoria-actividad";
import { AjustesSection } from "@/components/ajustes-section";
import { RenombrarDespacho } from "@/components/renombrar-despacho";
import { FotoPerfil } from "@/components/foto-perfil";
import { EncargoConfig } from "@/components/encargo-config";
import { LangSelector } from "@/components/lang-selector";
import { getT } from "@/lib/app-lang";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { RecibirDocumentosConfig } from "@/components/recibir-documentos-config";
import { direccionEntrante, generarTokenEntrante } from "@/lib/email-entrante";

// Dirección de recepción de documentos por email del despacho (03/09/2026): el token
// vive en Workspace.emailEntranteToken; si la migración lo dejó vacío, se genera aquí
// una sola vez. Sin la columna (migración pendiente) → null y el bloque lo dice.
async function direccionRecepcion(): Promise<{ direccion: string | null; pendientes: number }> {
  try {
    const supabase = await createSupabaseServer();
    const { data: m, error } = await supabase.from("Membership").select("workspaceId, Workspace(emailEntranteToken)").limit(1).maybeSingle();
    if (error || !m) return { direccion: null, pendientes: 0 };
    const wsRaw = (m as { Workspace?: { emailEntranteToken?: string | null } | { emailEntranteToken?: string | null }[] }).Workspace;
    const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
    let token = ws?.emailEntranteToken ?? null;
    if (!token) {
      token = generarTokenEntrante();
      const { error: eUp } = await createSupabaseAdmin().from("Workspace").update({ emailEntranteToken: token }).eq("id", m.workspaceId as string);
      if (eUp) return { direccion: null, pendientes: 0 };
    }
    const { count } = await supabase.from("BandejaEntrada").select("id", { count: "exact", head: true }).eq("estado", "PENDIENTE");
    return { direccion: direccionEntrante(token), pendientes: count ?? 0 };
  } catch { return { direccion: null, pendientes: 0 }; }
}

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

const IconEncargo = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M10.5 12.5l3 3L20 9" />
  </svg>
);

const IconFacturacion = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </svg>
);

export default async function Ajustes() {
  // Config réelle du workspace (Supabase, RLS) — defaults si pas encore configuré.
  // ⚠️ Promise.all : UN SEUL rejet tue la page entière. Les cinq autres appels
  // avaient déjà leur .catch ; ces deux-là ne l'avaient pas — d'où la page blanche
  // du 27/08 sur un simple hoquet de token. Les fonctions dégradent maintenant
  // elles-mêmes sur panne passagère (fallo:true) ; le .catch reste la ceinture.
  const [srv, avs, cuentas, equipo, despacho, packs, oficinas] = await Promise.all([
    fetchServiciosConfig().catch(() => ({ servicios: DEFAULT_SERVICIOS, desdeDb: false, fallo: true })),
    fetchAvisosConfig().catch(() => ({ avisos: DEFAULT_AVISOS, desdeDb: false, fallo: true })),
    fetchCuentasBancarias().catch(() => []), // table pas encore migrée → liste vide
    fetchEquipo().catch(() => null),
    fetchDespacho().catch(() => ({ nombre: "Mi despacho", nif: null, domicilio: null, emailFacturacion: null, logoUrl: null, hojaEncargoActiva: false, mandatarioNombre: null, mandatarioDni: null, mandatarioColegiado: null, mandatarioColegio: null, canalAvisos: "EMAIL" as const, encargoFormasPago: null, mandatoPropioPath: null })),
    fetchPacksConfig().catch(() => []),
    fetchOficinas().catch(() => []), // table pas encore migrée → liste vide
  ]);
  const { servicios } = srv;
  const { avisos } = avs;
  const recepcion = await direccionRecepcion();
  // Si la lecture a échoué, on montre les valeurs par DÉFAUT : enregistrer à ce
  // moment-là écraserait la configuration réelle du despacho. On le dit.
  const configNoCargada = Boolean(srv.fallo || avs.fallo);
  // MULTI-OFICINA — scopes des sedes NON-gestoría pour servicios/avisos (l'UI doit
  // distinguer « propio » de « heredando ») ; la fila automática (orden -1) édite
  // le scope común (null) de toujours.
  const sedes = oficinas.filter((o) => o.orden !== -1);
  const scopeServicios = new Map<string, Awaited<ReturnType<typeof fetchServiciosDeScope>>>();
  const scopeAvisos = new Map<string, Awaited<ReturnType<typeof fetchAvisosDeScope>>>();
  for (const o of sedes) {
    scopeServicios.set(o.id, await fetchServiciosDeScope(o.id).catch(() => ({ servicios: [], propios: false })));
    scopeAvisos.set(o.id, await fetchAvisosDeScope(o.id).catch(() => ({ avisos: [], propios: false })));
  }
  const otrasDe = (id: string) => oficinas.filter((x) => x.id !== id).map((x) => ({ id: x.id, nombre: x.nombre }));
  const conPastillas = oficinas.length >= 2;

  const yo = equipo?.miembros.find((m) => m.esYo);
  const despachoNombre = equipo?.workspace.nombre ?? "Mi despacho";
  const despachoTipo = equipo ? (TIPO_LABEL[equipo.workspace.tipo] ?? equipo.workspace.tipo) : "—";
  const despachoPlan = equipo ? planLabel(equipo.plan) : "Starter";
  // Les ajustes (servicios, avisos, cuentas) ne sont éditables que par un administrador.
  // La RLS l'impose côté base ; ici on désactive l'UI pour éviter les échecs silencieux.
  const puedeEditar = equipo ? puedeGestionarEquipo(equipo.miRol) : true;
  const miRolLabel = equipo ? ROLES[equipo.miRol]?.label ?? equipo.miRol : "";
  const t = await getT();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Ajustes")}</h1>
      <p className="mt-1 text-slate-500">{t("Configura tus servicios, los avisos a tus clientes y los datos de tu despacho.")}</p>

      {configNoCargada && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          <span>{t("No hemos podido cargar tu configuración ahora mismo. Lo que ves debajo son los valores por defecto: NO guardes nada o sobrescribirás lo tuyo. Vuelve a cargar la página en un minuto.")}</span>
        </div>
      )}

      {!puedeEditar && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <span>{t("Solo los administradores pueden editar los ajustes. Tu rol ({rol}) tiene acceso de solo lectura.").replace("{rol}", miRolLabel)}</span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <AjustesSection
          id="servicios"
          title={t("Servicios")}
          subtitle={`${servicios.filter((sv) => sv.active).length} ${t("activos")} · ${t("trámites, pagos y documentos")}`}
          icon={IconServicios}
        >
          <fieldset disabled={!puedeEditar} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
            {conPastillas ? (
              <FacturacionPorOficina
                comun={<ServiciosManager inicial={servicios} packsInicial={packs} />}
                oficinas={oficinas.map((o) => o.orden === -1
                  ? { id: o.id, nombre: o.nombre, panel: <ServiciosManager inicial={servicios} packsInicial={packs} /> }
                  : {
                      id: o.id,
                      nombre: o.nombre,
                      panel: (
                        <ConfigDeOficina
                          oficinaId={o.id}
                          nombre={o.nombre}
                          tabla="ServicioConfig"
                          propios={scopeServicios.get(o.id)?.propios ?? false}
                          comoOficinaId={null}
                          conDuplicarServicios
                          fuentesAvisos={sedes.filter((x) => x.id !== o.id && (scopeServicios.get(x.id)?.propios ?? false)).map((x) => ({ id: x.id, nombre: x.nombre, avisos: [] }))}
                          editor={<ServiciosManager inicial={scopeServicios.get(o.id)?.servicios ?? []} oficinaId={o.id} sinPacks />}
                        />
                      ),
                    })}
              />
            ) : (
              <ServiciosManager inicial={servicios} packsInicial={packs} />
            )}
          </fieldset>
        </AjustesSection>

        <AjustesSection
          id="notificaciones"
          title={t("Notificaciones al cliente")}
          subtitle={`Email · ${t("avisos automáticos en cada paso")}`}
          icon={IconAvisos}
        >
          <fieldset disabled={!puedeEditar} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
            {conPastillas ? (
              <FacturacionPorOficina
                comun={<AvisosManager inicial={avisos} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} envioWhatsAppActivo={Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)} canalInicial={despacho.canalAvisos} />}
                oficinas={oficinas.map((o) => o.orden === -1
                  ? { id: o.id, nombre: o.nombre, panel: <AvisosManager inicial={avisos} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} envioWhatsAppActivo={Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)} canalInicial={despacho.canalAvisos} /> }
                  : {
                      id: o.id,
                      nombre: o.nombre,
                      panel: (
                        <ConfigDeOficina
                          oficinaId={o.id}
                          nombre={o.nombre}
                          tabla="AvisoConfig"
                          propios={scopeAvisos.get(o.id)?.propios ?? false}
                          comoOficinaId={o.avisosComoOficinaId}
                          fuentesAvisos={[
                            { id: null, nombre: t("la gestoría"), avisos },
                            ...sedes.filter((x) => x.id !== o.id && (scopeAvisos.get(x.id)?.propios ?? false)).map((x) => ({ id: x.id, nombre: x.nombre, avisos: scopeAvisos.get(x.id)?.avisos ?? [] })),
                            ...oficinas.filter((x) => x.orden === -1 && x.id !== o.id).map((x) => ({ id: x.id, nombre: x.nombre, avisos })),
                          ]}
                          editor={<AvisosManager inicial={scopeAvisos.get(o.id)?.avisos ?? avisos} oficinaId={o.id} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} />}
                        />
                      ),
                    })}
              />
            ) : (
              <AvisosManager
                inicial={avisos}
                envioEmailActivo={Boolean(process.env.RESEND_API_KEY)}
                envioWhatsAppActivo={Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)}
                canalInicial={despacho.canalAvisos}
              />
            )}
          </fieldset>
          <RecibirDocumentosConfig direccion={recepcion.direccion} pendientes={recepcion.pendientes} />
        </AjustesSection>

        {puedeEditar && (
          <AjustesSection
            id="encargo"
            title={t("Hoja de encargo y mandato")}
            subtitle={despacho.hojaEncargoActiva ? t("Activada — el cliente firma desde su portal") : t("Desactivada")}
            icon={IconEncargo}
          >
            {(() => {
              const panelDespacho = (
                <EncargoConfig
                  inicial={{
                    hojaEncargoActiva: despacho.hojaEncargoActiva,
                    mandatarioNombre: despacho.mandatarioNombre ?? "",
                    mandatarioDni: despacho.mandatarioDni ?? "",
                    mandatarioColegiado: despacho.mandatarioColegiado ?? "",
                    mandatarioColegio: despacho.mandatarioColegio ?? "",
                    encargoFormasPago: despacho.encargoFormasPago ?? "",
                    mandatoPropio: Boolean(despacho.mandatoPropioPath),
                  }}
                />
              );
              if (!conPastillas) return panelDespacho;
              return (
                <FacturacionPorOficina
                  comun={panelDespacho}
                  oficinas={oficinas.map((o) => o.orden === -1
                    ? { id: o.id, nombre: o.nombre, panel: panelDespacho }
                    : {
                        id: o.id,
                        nombre: o.nombre,
                        panel: (
                          <OficinaEncargo
                            oficinaId={o.id}
                            nombre={o.nombre}
                            comoOficinaId={o.encargoComoOficinaId}
                            fuentes={[
                              /* la gestoría (bloc du despacho) + les sedes avec bloc propre */
                              { id: null, nombre: t("la gestoría"), bloque: {
                                hojaEncargoActiva: Boolean(despacho.hojaEncargoActiva),
                                mandatarioNombre: despacho.mandatarioNombre ?? "", mandatarioDni: despacho.mandatarioDni ?? "",
                                mandatarioColegiado: despacho.mandatarioColegiado ?? "", mandatarioColegio: despacho.mandatarioColegio ?? "",
                                encargoFormasPago: despacho.encargoFormasPago ?? "",
                              } },
                              ...oficinas.filter((x) => x.id !== o.id && (x.orden === -1 || x.hojaEncargoActiva !== null)).map((x) => ({
                                id: x.id, nombre: x.nombre,
                                bloque: x.orden === -1
                                  ? {
                                      hojaEncargoActiva: Boolean(despacho.hojaEncargoActiva),
                                      mandatarioNombre: despacho.mandatarioNombre ?? "", mandatarioDni: despacho.mandatarioDni ?? "",
                                      mandatarioColegiado: despacho.mandatarioColegiado ?? "", mandatarioColegio: despacho.mandatarioColegio ?? "",
                                      encargoFormasPago: despacho.encargoFormasPago ?? "",
                                    }
                                  : {
                                      hojaEncargoActiva: Boolean(x.hojaEncargoActiva),
                                      mandatarioNombre: x.mandatarioNombre ?? "", mandatarioDni: x.mandatarioDni ?? "",
                                      mandatarioColegiado: x.mandatarioColegiado ?? "", mandatarioColegio: x.mandatarioColegio ?? "",
                                      encargoFormasPago: x.encargoFormasPago ?? "",
                                    },
                              })),
                            ]}
                            inicial={{
                              hojaEncargoActiva: o.hojaEncargoActiva,
                              mandatarioNombre: o.mandatarioNombre ?? "",
                              mandatarioDni: o.mandatarioDni ?? "",
                              mandatarioColegiado: o.mandatarioColegiado ?? "",
                              mandatarioColegio: o.mandatarioColegio ?? "",
                              encargoFormasPago: o.encargoFormasPago ?? "",
                            }}
                          />
                        ),
                      })}
                />
              );
            })()}
          </AjustesSection>
        )}

        <AjustesSection
          id="facturacion"
          title={t("Facturación y métodos de pago")}
          subtitle={`${cuentas.length > 0 ? `${cuentas.length} ${cuentas.length === 1 ? t("cuenta bancaria") : t("cuentas bancarias")}` : t("Sin cuenta bancaria")} · ${t("datos de facturación y tarjeta")}`}
          icon={IconFacturacion}
        >
          {/* Todo lo relacionado con cobrar: cabecera de facturas + cuentas + tarjeta.
              Datos sensibles → solo administradores (la RLS lo impone en base). */}
          <div className="[&>*:first-child]:mt-0">
            {puedeEditar ? (
              /* fase 6 — con 2+ oficinas, cada sede elige sus datos, su cuenta y su tarjeta.
                 Con 0-1 oficinas el conmutador se esfuma y esto ES la sección de siempre. */
              <FacturacionPorOficina
                comun={<>
                  <DespachoFacturacion inicial={despacho} />
                  <CuentasBancarias inicial={cuentas.filter((c) => !c.oficinaId)} />
                  <CobroTarjetaConfig />
                </>}
                oficinas={oficinas.map((o) => o.orden === -1
                  ? {
                      /* La oficina de la gestoría (fila automática): edita los datos
                         históricos del despacho — encabezado, cuentas y tarjeta de
                         siempre — que además sirven de respaldo a las demás sedes. */
                      id: o.id,
                      nombre: o.nombre,
                      nota: `${o.nombre}: ${t("los datos de la gestoría. Sirven de respaldo para cualquier otra oficina sin datos propios.")}`,
                      panel: <>
                        <DespachoFacturacion inicial={despacho} />
                        <CuentasBancarias inicial={cuentas.filter((c) => !c.oficinaId)} />
                        <CobroTarjetaConfig />
                      </>,
                    }
                  : {
                      id: o.id,
                      nombre: o.nombre,
                      nota: `${t("Configuración de")} ${o.nombre}: ${t("sus facturas, su hoja de encargo y los cobros de sus clientes usarán estos datos. Lo que dejes vacío cae en los datos de la gestoría.")}`,
                      panel: <>
                        <OficinaFacturacion oficinaId={o.id} nombre={o.nombre} logoInicial={o.logoUrl} inicial={{
                          razonSocial: o.razonSocial ?? "", nif: o.nif ?? "", domicilio: o.domicilio ?? "",
                          emailFacturacion: o.emailFacturacion ?? "", prefijoSerie: o.prefijoSerie ?? "",
                        }} />
                        <CuentasBancarias inicial={cuentas.filter((c) => c.oficinaId === o.id)} oficinaId={o.id} />
                        <CobroTarjetaConfig oficinaId={o.id} />
                      </>,
                    })}
              />
            ) : (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3 text-sm text-slate-500">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>{t("La facturación y los cobros solo son accesibles para los administradores.")}</span>
              </div>
            )}
          </div>
        </AjustesSection>

        {equipo && (
          <AjustesSection
            id="plan"
            title={t("Plan y equipo")}
            subtitle={`${despachoPlan} · ${equipo.miembros.length} ${equipo.miembros.length === 1 ? t("usuario") : t("usuarios")}`
              + (oficinas.length > 0 ? ` · ${oficinas.length} ${oficinas.length === 1 ? t("oficina") : t("oficinas")}` : "")}
            icon={IconEquipo}
          >
            <EquipoManager inicial={equipo} oficinas={oficinas} />

            {/* Multi-oficina : au pied de « Plan y equipo », pas dans une section à part.
                Répartir l'équipe entre les sedes est la suite naturelle de la gérer —
                et la fonctionnalité dépend du plan affiché juste au-dessus.
                Visible dès qu'on peut administrer (upsell si pas Business) ou dès qu'il
                existe des oficinas (les gestores y lisent la répartition). */}
            {(puedeEditar || oficinas.length > 0) && (
              <div className="mt-8 border-t border-slate-200 pt-6">
                {/* Même en-tête que « Miembros del equipo » juste au-dessus : dans une
                    section dépliée, deux blocs frères doivent se ressembler. */}
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Oficinas")}</h3>
                <OficinasManager
                  inicial={oficinas}
                  plan={equipo.plan}
                  puedeEditar={puedeEditar}
                />
              </div>
            )}
          </AjustesSection>
        )}

        <AjustesSection
          id="despacho"
          title={t("Despacho y cuenta")}
          subtitle={t("Datos de tu gestoría y de tu usuario")}
          icon={IconCuenta}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Despacho")}</h3>
              <div className="mt-4 space-y-3 text-sm">
                <RenombrarDespacho nombre={despachoNombre} puedeEditar={puedeEditar} />
                {oficinas.length >= 2 && (
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    {t("Independiente de los nombres de las oficinas: puede ser una holding, una entidad central o una de tus oficinas.")}
                  </p>
                )}
                <div className="flex justify-between"><span className="text-slate-500">{t("Tipo")}</span><span className="font-medium text-slate-800">{despachoTipo}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{t("Plan")}</span><span className="rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">{despachoPlan}</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Cuenta")}</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">{t("Nombre")}</span><span className="font-medium text-slate-800">{yo?.nombre ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{t("Email")}</span><span className="font-medium text-slate-800">{yo?.email ?? "—"}</span></div>
              </div>
              {/* Foto de perfil: aquí es visible y usable también en el móvil, donde
                  el avatar de la barra lateral ni se ve ni tiene hover. */}
              <FotoPerfil nombre={yo?.nombre ?? ""} avatarUrl={yo?.avatarUrl} />
            </div>
          </div>

          {/* Idioma de la interfaz */}
          <div className="mt-4">
            <LangSelector />
          </div>

          {/* Instalar como app (PWA) */}
          <div className="mt-4">
            <InstallPWA />
          </div>

          {/* Memoria de actividad — art. 8.1.f de la Orden ISM/164/2026. Las entidades
              inscritas en el Registro de Colaboradores de Extranjería deben aportarla al
              renovar su inscripción; el resto de despachos la usa como memoria anual.
              Solo administración: es un documento institucional de la entidad entera. */}
          {puedeEditar && (
            <div id="memoria" className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
              <p className="text-sm font-semibold text-slate-800">{t("Memoria de actividad")}</p>
              <MemoriaActividad />
            </div>
          )}

          {/* Integración de videollamadas (Google Meet) — cierra la sección. */}
          {puedeEditar && <GoogleCalendarConfig />}

        </AjustesSection>
      </div>
    </div>
  );
}
