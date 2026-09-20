import { fetchServiciosConfig, fetchAvisosConfig, fetchCuentasBancarias, fetchDespacho, fetchPacksConfig, fetchCarpetasConfig } from "@/lib/data/config";
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
import { VerifactuConfig } from "@/components/verifactu-config";
import { GoogleCalendarConfig } from "@/components/google-calendar-config";
import { DespachoFacturacion } from "@/components/despacho-facturacion";
import { InstallPWA } from "@/components/install-pwa";
import { EquipoManager } from "@/components/equipo-manager";
import { OficinasManager } from "@/components/oficinas-manager";
import { AjustesSection } from "@/components/ajustes-section";
import { RenombrarDespacho } from "@/components/renombrar-despacho";
import { LogoDespacho } from "@/components/logo-despacho";
import { EncargoConfig } from "@/components/encargo-config";
import { LangSelector } from "@/components/lang-selector";
import { getT } from "@/lib/app-lang";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { RecibirDocumentosConfig } from "@/components/recibir-documentos-config";
import { WhatsAppConectar } from "@/components/whatsapp-conectar";
import { BandejaEntrada, type FilaBandeja, type ClienteOpcion, type ExpedienteOpcion } from "@/components/bandeja-entrada";
import { direccionEntrante, generarTokenEntrante } from "@/lib/email-entrante";
import { whatsappDisponible } from "@/lib/whatsapp";
import { PLANTILLA_AVISO } from "@/lib/whatsapp-plantillas";

// WhatsApp del despacho (Meta, 12/09/2026): su número conectado, si lo hay — decide si
// Notificaciones enseña el selector Email/WhatsApp/Ambos y qué dice la bandera. Lectura
// bajo RLS (política de solo lectura; el token cifrado no se selecciona). Sin la tabla
// (migración pendiente) → null: la pantalla es la de siempre.
type WhatsAppConectado = { telefono: string | null; plantillaAprobada: boolean };
async function fetchWhatsAppConectado(): Promise<WhatsAppConectado | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("WhatsAppCuenta").select("telefono, plantillas, oficinaId, createdAt").eq("estado", "CONECTADA").order("createdAt").limit(10);
    if (error || !data?.length) return null;
    const filas = data as { telefono: string | null; plantillas: Record<string, string> | null; oficinaId: string | null }[];
    const c = filas.find((f) => !f.oficinaId) ?? filas[0];
    const plantillas = c.plantillas ?? {};
    return { telefono: c.telefono, plantillaAprobada: Object.entries(plantillas).some(([k, v]) => k.startsWith(`${PLANTILLA_AVISO}:`) && v === "APPROVED") };
  } catch { return null; }
}

// Dirección de recepción de documentos por email del despacho (03/09/2026): el token
// vive en Workspace.emailEntranteToken; si la migración lo dejó vacío, se genera aquí
// una sola vez. Sin la columna (migración pendiente) → null y el bloque lo dice.
async function direccionRecepcion(): Promise<{ direccion: string | null }> {
  try {
    const supabase = await createSupabaseServer();
    const { data: m, error } = await supabase.from("Membership").select("workspaceId, Workspace(emailEntranteToken)").limit(1).maybeSingle();
    if (error || !m) return { direccion: null };
    const wsRaw = (m as { Workspace?: { emailEntranteToken?: string | null } | { emailEntranteToken?: string | null }[] }).Workspace;
    const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
    let token = ws?.emailEntranteToken ?? null;
    if (!token) {
      token = generarTokenEntrante();
      const { error: eUp } = await createSupabaseAdmin().from("Workspace").update({ emailEntranteToken: token }).eq("id", m.workspaceId as string);
      if (eUp) return { direccion: null };
    }
    return { direccion: direccionEntrante(token) };
  } catch { return { direccion: null }; }
}

// Bandeja de entrada (Ajustes → Integraciones, 06/09/2026): emails con documentos que
// Aproba no ha podido atribuir a un cliente, más los últimos colocados. Todo bajo RLS.
// Los selectores de asignación (clientes + expedientes vivos) solo se cargan si hay
// algo pendiente: en un despacho grande son miles de filas para una sección plegada.
type Bandeja = { faltaMigracion: boolean; pendientes: FilaBandeja[]; recientes: FilaBandeja[]; clientes: ClienteOpcion[]; expedientes: ExpedienteOpcion[] };
async function fetchBandeja(): Promise<Bandeja> {
  const vacia: Bandeja = { faltaMigracion: false, pendientes: [], recientes: [], clientes: [], expedientes: [] };
  try {
    const supabase = await createSupabaseServer();
    const base = "id, remitente, remitenteNombre, asunto, texto, recibidoAt, adjuntos, clienteId, expedienteId, estado, motivo";
    // canal/remitenteTelefono llegan con supabase/whatsapp-meta.sql: sin ellas, la misma lectura de antes.
    const leer = (cols: string) => Promise.all([
      supabase.from("BandejaEntrada").select(cols).eq("estado", "PENDIENTE").order("recibidoAt", { ascending: false }).limit(100),
      supabase.from("BandejaEntrada").select(cols).neq("estado", "PENDIENTE").order("updatedAt", { ascending: false }).limit(15),
    ]);
    let [pend, rec] = await leer(`${base}, canal, remitenteTelefono`);
    if (pend.error && /canal|remitenteTelefono/i.test(pend.error.message)) [pend, rec] = await leer(base);
    if (pend.error) return { ...vacia, faltaMigracion: /BandejaEntrada|relation|schema cache/i.test(pend.error.message) };
    const pendientes = (pend.data ?? []) as unknown as FilaBandeja[];
    const recientes = (rec.data ?? []) as unknown as FilaBandeja[];
    if (pendientes.length > 0) {
      const [cli, exps] = await Promise.all([
        supabase.from("Cliente").select("id, nombre, apellidos").order("nombre", { ascending: true }).limit(2000),
        supabase.from("Expediente").select("id, clienteId, referencia, tipo, archivadoAt").is("archivadoAt", null).limit(2000),
      ]);
      const expedientes = ((exps.data ?? []) as (ExpedienteOpcion & { archivadoAt: string | null })[]).filter((e) => e.clienteId);
      return { faltaMigracion: false, pendientes, recientes, clientes: (cli.data ?? []) as ClienteOpcion[], expedientes };
    }
    const ids = [...new Set(recientes.map((r) => r.clienteId).filter((x): x is string => Boolean(x)))];
    const cli = ids.length ? await supabase.from("Cliente").select("id, nombre, apellidos").in("id", ids) : { data: [] as ClienteOpcion[] };
    return { faltaMigracion: false, pendientes, recientes, clientes: (cli.data ?? []) as ClienteOpcion[], expedientes: [] };
  } catch { return vacia; }
}

export const metadata = { title: "Ajustes" };

// Iconos de las secciones (trazos Lucide, licencia ISC): misma familia que la
// navegación — 2 px, remates redondos — pero cada dibujo se reconoce a 20 px.
const IconServicios = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="6" rx="2" />
    <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <path d="M22 13a18.15 18.15 0 0 1-20 0" />
    <path d="M12 12h.01" />
  </svg>
);

const IconAvisos = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M22 8c0-2.3-.8-4.3-2-6" />
    <path d="M4 2C2.8 3.7 2 5.7 2 8" />
  </svg>
);

const IconCuenta = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </svg>
);

const IconEquipo = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="8" r="5" />
    <path d="M18 21a8 8 0 0 0-16 0" />
    <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
  </svg>
);

const IconEncargo = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 5-2.414-2.414A2 2 0 0 0 14.172 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    <path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    <path d="M8 18h1" />
  </svg>
);

const IconFacturacion = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="12" x="2" y="6" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const IconIntegraciones = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2v6M15 2v6" />
    <path d="M5 8h14" />
    <path d="M6 11V8h12v3a6 6 0 1 1-12 0Z" />
    <path d="M12 17v5" />
  </svg>
);

export default async function Ajustes() {
  // Config réelle du workspace (Supabase, RLS) — defaults si pas encore configuré.
  // ⚠️ Promise.all : UN SEUL rejet tue la page entière. Les cinq autres appels
  // avaient déjà leur .catch ; ces deux-là ne l'avaient pas — d'où la page blanche
  // du 27/08 sur un simple hoquet de token. Les fonctions dégradent maintenant
  // elles-mêmes sur panne passagère (fallo:true) ; le .catch reste la ceinture.
  const [srv, avs, cuentas, equipo, despacho, packs, oficinas, carpetas] = await Promise.all([
    fetchServiciosConfig().catch(() => ({ servicios: DEFAULT_SERVICIOS, desdeDb: false, fallo: true })),
    fetchAvisosConfig().catch(() => ({ avisos: DEFAULT_AVISOS, desdeDb: false, fallo: true })),
    fetchCuentasBancarias().catch(() => []), // table pas encore migrée → liste vide
    fetchEquipo().catch(() => null),
    fetchDespacho().catch(() => ({ nombre: "Mi despacho", nif: null, domicilio: null, domicilioActividad: null, emailFacturacion: null, logoUrl: null, hojaEncargoActiva: false, mandatarioNombre: null, mandatarioDni: null, mandatarioColegiado: null, mandatarioColegio: null, canalAvisos: "EMAIL" as const, encargoFormasPago: null, mandatoPropioPath: null })),
    fetchPacksConfig().catch(() => []),
    fetchOficinas().catch(() => []), // table pas encore migrée → liste vide
    fetchCarpetasConfig().catch(() => []), // sin migración de carpetas → catálogo plano
  ]);
  const { servicios } = srv;
  const { avisos } = avs;
  const recepcion = await direccionRecepcion();
  const bandeja = await fetchBandeja();
  const whatsapp = await fetchWhatsAppConectado();
  // Puede enviar WhatsApp de verdad: su número (Meta) o el transporte de plataforma (Twilio).
  const envioWhatsAppActivo = Boolean(whatsapp) || whatsappDisponible();
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
  // Acceso por persona a las carpetas: la lista del equipo y quién mira.
  const equipoCarpetas = (equipo?.miembros ?? []).map((m) => ({ userId: m.userId, nombre: m.nombre, avatarUrl: m.avatarUrl }));
  const propsCarpetas = {
    carpetasInicial: carpetas,
    equipo: equipoCarpetas,
    miUserId: yo?.userId ?? null,
    soyAdmin: yo ? yo.role === "OWNER" || yo.role === "ADMIN" : true,
  };
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
                comun={<ServiciosManager inicial={servicios} packsInicial={packs} {...propsCarpetas} />}
                oficinas={oficinas.map((o) => o.orden === -1
                  ? { id: o.id, nombre: o.nombre, panel: <ServiciosManager inicial={servicios} packsInicial={packs} {...propsCarpetas} /> }
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
                          editor={<ServiciosManager inicial={scopeServicios.get(o.id)?.servicios ?? []} oficinaId={o.id} sinPacks {...propsCarpetas} />}
                        />
                      ),
                    })}
              />
            ) : (
              <ServiciosManager inicial={servicios} packsInicial={packs} {...propsCarpetas} />
            )}
          </fieldset>
        </AjustesSection>

        <AjustesSection
          id="notificaciones"
          title={t("Notificaciones al cliente")}
          subtitle={`${envioWhatsAppActivo ? "Email · WhatsApp" : "Email"} · ${t("avisos automáticos en cada paso")}`}
          icon={IconAvisos}
        >
          <fieldset disabled={!puedeEditar} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
            {conPastillas ? (
              <FacturacionPorOficina
                comun={<AvisosManager inicial={avisos} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} envioWhatsAppActivo={envioWhatsAppActivo} whatsapp={whatsapp} canalInicial={despacho.canalAvisos} />}
                oficinas={oficinas.map((o) => o.orden === -1
                  ? { id: o.id, nombre: o.nombre, panel: <AvisosManager inicial={avisos} envioEmailActivo={Boolean(process.env.RESEND_API_KEY)} envioWhatsAppActivo={envioWhatsAppActivo} whatsapp={whatsapp} canalInicial={despacho.canalAvisos} /> }
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
                envioWhatsAppActivo={envioWhatsAppActivo} whatsapp={whatsapp}
                canalInicial={despacho.canalAvisos}
              />
            )}
          </fieldset>
        </AjustesSection>

        {/* Integraciones — lo que entra en Aproba sin pasar por la app (06/09/2026): la
            dirección de recepción de documentos por email y la bandeja con los emails que
            Aproba no supo de quién eran. Antes: tarjeta dentro de Notificaciones + pestaña
            «Bandeja» del menú (retirada; /app/bandeja redirige aquí). Visible para todo el
            equipo: asignar un email es trabajo de gestor, no de administración. */}
        <AjustesSection
          id="integraciones"
          title={t("Integraciones")}
          subtitle={bandeja.pendientes.length > 0
            ? `${bandeja.pendientes.length} ${bandeja.pendientes.length === 1 ? t("email por asignar") : t("emails por asignar")}`
            : whatsapp ? t("Email entrante · WhatsApp · bandeja · Google Meet") : t("Email entrante · bandeja · Google Meet")}
          icon={IconIntegraciones}
        >
          <RecibirDocumentosConfig direccion={recepcion.direccion} pendientes={bandeja.pendientes.length} />
          <WhatsAppConectar oficinas={oficinas.map((o) => ({ id: o.id, nombre: o.nombre }))} />
          <div id="bandeja" className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Bandeja de entrada")}</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">{t("Documentos recibidos por email o WhatsApp que esperan a que digas de qué cliente son.")}</p>
            {bandeja.faltaMigracion ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("La recepción por email estará disponible cuando se aplique la migración de la base de datos.")}</p>
            ) : (
              <BandejaEntrada pendientes={bandeja.pendientes} recientes={bandeja.recientes} clientes={bandeja.clientes} expedientes={bandeja.expedientes} whatsappConectado={Boolean(whatsapp)} />
            )}
          </div>

          {/* Videollamadas (Google Meet): conectar la cuenta de Google es administración. */}
          {puedeEditar && (
            <div className="mt-8 border-t border-slate-200 pt-4">
              <GoogleCalendarConfig />
            </div>
          )}
        </AjustesSection>

        {puedeEditar && (
          <AjustesSection
            id="encargo"
            title={t("Hoja de encargo y mandato")}
            subtitle={despacho.hojaEncargoActiva ? t("Activada — el cliente firma desde su portal") : t("Desactivada")}
            icon={IconEncargo}
          >
            {/* Luis (Asenjo, 15/09) no encontró dónde poner el domicilio de actividad: el campo
                vive en Facturación, pero quien lo busca está aquí. Se dice y se enlaza. */}
            <p className="mb-4 text-xs text-slate-500">
              {t("El domicilio que figura en la hoja de encargo y en el presupuesto es el de actividad, si está relleno; si no, el fiscal.")}{" "}
              <a href="/app/ajustes?abrir=facturacion" className="font-medium text-aproba-700 hover:underline">{t("Rellenarlo en Facturación")}</a>
            </p>
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
                  <VerifactuConfig />
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
                        {/* VERI*FACTU lista TODOS los NIF emisores (despacho + sedes con NIF propio). */}
                        <VerifactuConfig />
                      </>,
                    }
                  : {
                      id: o.id,
                      nombre: o.nombre,
                      nota: `${t("Configuración de")} ${o.nombre}: ${t("sus facturas, su hoja de encargo y los cobros de sus clientes usarán estos datos. Lo que dejes vacío cae en los datos de la gestoría.")}`,
                      panel: <>
                        <OficinaFacturacion oficinaId={o.id} nombre={o.nombre} logoInicial={o.logoUrl} inicial={{
                          razonSocial: o.razonSocial ?? "", nif: o.nif ?? "", domicilio: o.domicilio ?? "", domicilioActividad: o.domicilioActividad ?? "",
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
              <LogoDespacho logoUrl={despacho.logoUrl} puedeEditar={puedeEditar} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Cuenta")}</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">{t("Nombre")}</span><span className="font-medium text-slate-800">{yo?.nombre ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{t("Email")}</span><span className="font-medium text-slate-800">{yo?.email ?? "—"}</span></div>
              </div>
              {/* La foto del USUARIO se cambia desde su círculo en la barra lateral (abajo a la
                  izquierda); aquí solo se recuerda dónde. El logo del despacho va en la otra columna. */}
              <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">{t("Tu foto de perfil se cambia pulsando tu círculo en la barra lateral (abajo a la izquierda).")}</p>
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


        </AjustesSection>
      </div>
    </div>
  );
}
