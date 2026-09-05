import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchExpedienteDetalle, fetchNotasExpediente, progresoDeExpediente } from "@/lib/data/expedientes";
import { NotasExpediente } from "@/components/notas-expediente";
import { SeccionPlegable } from "@/components/seccion-plegable";
import { InformacionCliente } from "@/components/informacion-cliente";
import { EnlaceCliente } from "@/components/enlace-cliente";
import { FICHA_CAMPOS, type ClienteFicha } from "@/lib/ficha";
import { etiquetaSalida, salidaDeEstado } from "@/lib/types";
import { CitasPanel } from "@/components/citas-panel";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFamiliaDetalle, fetchFacturaFamiliaPrefill, fetchFacturasDeFamilia } from "@/lib/data/familias";
import { FamiliaExpedienteSection } from "@/components/familia-expediente-section";
import { fetchServiciosConfig } from "@/lib/data/config";
import { fmtFechaCorta, docsFaltantes, labelADocTipo, emparejarDocs, TIPO_A_SERVICIO, DOC_LABEL } from "@/lib/tramites";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { docsFamiliaPorServicios, docsExtraPlanos, sinQuitados } from "@/lib/familia";
import { catalogoDeSede, serviciosDeExpediente, docsDeExpediente, tarifaDeServicios, citaDeServicios, labelServicios, suplidosDeExpediente, aplicarDescuento, restoPendiente, suplidosAsignados, tarifaAsignada } from "@/lib/multi-servicio";
import { DescuentoExpediente } from "@/components/descuento-expediente";
import { AsignarExpediente } from "@/components/asignar-expediente";
import { r2, eur, anticipoPagado } from "@/lib/facturas";
import { RecordarDocsButton } from "@/components/recordar-docs-button";
import { ArchivarButton } from "@/components/archivar-button";
import { EliminarExpedienteButton } from "@/components/eliminar-expediente-button";
import { ExportarZipButton } from "@/components/exportar-zip-button";
import { EliminarEjemploButton } from "@/components/eliminar-ejemplo-button";
import { esEjemplo } from "@/lib/ejemplo-marca";
import { DocumentoRow } from "@/components/documento-row";
import { CobrosPanel } from "@/components/cobros-panel";
import { CobroExternoLink } from "@/components/cobro-externo-link";
import { SuplidosExpediente } from "@/components/suplidos-expediente";
import { RellenarMercurio } from "@/components/rellenar-mercurio";
import { PhaseStepper } from "@/components/phase-stepper";
import { ValidarExpediente } from "@/components/validar-expediente";
import { CambiarServicio } from "@/components/cambiar-servicio";
import { SubirDocumentoGestor } from "@/components/subir-documento-gestor";
import { CasillaDocumentoGestor } from "@/components/casilla-documento-gestor";
import { DocumentosEsperados } from "@/components/documentos-esperados";
import { FormulariosGeneradosChips } from "@/components/formularios-generados-chips";
import { camposMercurioFlat } from "@/lib/mercurio";
import { AutoRefresh } from "@/components/auto-refresh";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Expediente" };

// hoja de encargo/mandato: enlaces de descarga del gestor si la función está activada
async function encargoActivado(): Promise<boolean> {
  try {
    const { fetchDespacho } = await import("@/lib/data/config");
    return (await fetchDespacho()).hojaEncargoActiva;
  } catch { return false; }
}

export default async function ExpedienteDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Las 4 fuentes independientes EN PARALELO (antes: awaits secuenciales = 1-3 s mudos).
  const [t, e, { servicios }, notas] = await Promise.all([
    getT(),
    fetchExpedienteDetalle(id),
    fetchServiciosConfig(),
    fetchNotasExpediente(id),
  ]);
  if (!e) notFound();

  const despachoEncargo = await encargoActivado();

  // Équipe, pour le sélecteur « Asignado a » du pied de fiche. Traspasar peut
  // n'importe quel membre — y compris l'asistente (voir components/asignar-expediente).
  const supaRol = await createSupabaseServer();
  // Sedes del despacho: el editor de la ficha del cliente las necesita (multi-oficina).
  const { data: ofisRaw } = await supaRol.from("Oficina").select("id, nombre").order("orden");
  const oficinasDespacho = (ofisRaw ?? []) as { id: string; nombre: string }[];
  const { data: memsRaw } = await supaRol.from("Membership").select("userId, User(nombre, email)");
  type MemRow = { userId: string; User: { nombre: string | null; email: string | null } | { nombre: string | null; email: string | null }[] | null };
  const miembrosEquipo = ((memsRaw ?? []) as MemRow[]).map((m) => {
    const u = Array.isArray(m.User) ? m.User[0] : m.User;
    return { userId: m.userId, nombre: u?.nombre || u?.email || "Usuario" };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Expediente FAMILIAR (Expediente.familiaId): miembros + facturación familiar en la ficha.
  const [familia, famPrefill, famFacturas] = e.familiaId
    ? await Promise.all([fetchFamiliaDetalle(e.familiaId), fetchFacturaFamiliaPrefill(e.familiaId), fetchFacturasDeFamilia(e.familiaId)])
    : [null, null, []];
  // Multi-servicio: principal (servicioClave, repli por tipo) + extras. Docs = unión,
  // tarifa = suma, cita = OR (gestor gana) — mismas reglas que la API y el portal.
  // ⚠️ CATÁLOGO POR SEDE PRIMERO (catalogoDeSede): con claves duplicadas entre sedes,
  // usar todas las filas mezcladas elegía un ganador al azar — distinto del tablero y
  // del portal /j (que ya cascadea). Tarifa, docs y cita salen del MISMO catálogo.
  const serviciosSede = catalogoDeSede(servicios, e.oficinaId);
  const serviciosExp = serviciosDeExpediente({ servicioClave: e.servicioClave, serviciosExtra: e.serviciosExtra, tipo: e.tipoEnum }, serviciosSede);
  // Lo que hay que reunir = documentos del servicio + los que el gestor pidió a mano
  // en ESTA ficha. Un solo resolutor para la ficha, el portal, el progreso y el aviso.
  const docsRequeridos = docsDeExpediente(serviciosExp, e.docsExtra);
  // Arranque en 1 clic cuando no hay nada: la lista habitual del trámite. Si el
  // expediente es «Otro» (sin trámite estándar), no se inventa nada — el gestor elige.
  const sugerenciasDocs = (() => {
    if (docsRequeridos.length > 0) return [];
    const clave = e.servicioClave ?? TIPO_A_SERVICIO[e.tipoEnum] ?? null;
    const estandar = clave ? DEFAULT_SERVICIOS.find((d) => d.id === clave) : null;
    return estandar?.docs ?? [];
  })();
  // Casillas de la ficha: firma PRIMERO (mismo orden que el portal /j y /s) y luego
  // los del trámite. La hoja/mandato firmados van por casilla como todo lo demás —
  // era lo ÚNICO que quedaba en el selector manual, que ya no hace falta.
  const casillasFicha = familia
    ? []
    : [...sinQuitados(despachoEncargo ? [DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO] : [], e.docsExtra), ...docsRequeridos];
  const tarifa = tarifaDeServicios(serviciosExp);
  const cita = citaDeServicios(serviciosExp);
  const etiquetaServicios = labelServicios(serviciosExp, e.tipoLabel);
  // Tasas y suplidos del servicio — MISMO cálculo que /api/pagos (el popup de cobro
  // debe emitir exactamente lo que emitiría el portal). Familia heterogénea: cada
  // servicio × SUS miembros asignados (tarifaAsignada); sin asignación, ×N clásico.
  // Tasas 790 NOMINATIVAS de la familia (storage, ruta determinista) → chips en la
  // sección Formularios (antes eran invisibles en la ficha: solo /s y el ZIP las veían).
  let tasaMiembrosIds: string[] = [];
  if (familia) {
    try {
      const { data: archivos } = await createSupabaseAdmin().storage.from("documentos").list(e.id);
      const conTasa = new Set((archivos ?? []).map((x) => x.name).filter((n) => /^tasa-790-012-.+\.pdf$/.test(n)).map((n) => n.slice("tasa-790-012-".length, -".pdf".length)));
      tasaMiembrosIds = familia.miembros.filter((m) => conTasa.has(m.id)).map((m) => m.id);
    } catch { /* sin storage legible → sin chips de tasa */ }
  }
  const asignadosExp = new Set(Object.values(e.serviciosAsignacion ?? {}).flat());
  const solicitantesExp = familia ? (() => { const sol = familia.miembros.filter((m) => m.esSolicitante || asignadosExp.has(m.id)); return sol.length ? sol : familia.miembros; })() : [];
  const nMiembrosExp = Math.max(1, familia?.miembros.length ?? 1);
  // Familiar: lo que se pide, con su ámbito. Los del servicio salen del MISMO
  // repartidor que el portal (docsFamiliaPorServicios) para no divergir.
  const repartoFamilia = (() => {
    if (!familia) return null;
    const sol = solicitantesExp.length ? solicitantesExp : familia.miembros;
    const rep = docsFamiliaPorServicios(
      serviciosExp,
      e.serviciosAsignacion,
      sol.map((m) => ({ id: m.id, fechaNacimiento: (m.ficha?.fechaNacimiento as string | undefined) ?? null })),
      e.docsExtra,
    );
    // Firma: la hoja/mandato se piden UNA vez (al representante) — igual que el portal.
    const firma = sinQuitados(despachoEncargo ? [DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO] : [], e.docsExtra);
    return { ...rep, comunes: [...firma, ...rep.comunes], miembros: sol };
  })();
  const propiosFicha = new Set(docsExtraPlanos(e.docsExtra));
  // Grupos de la ficha familiar (comunes + un miembro por sección) con SUS documentos
  // ya emparejados: se calcula ANTES del JSX para saber qué documentos quedan fuera
  // (si no, el bloque de abajo los repintaba y salían dos veces).
  const gruposFamilia = repartoFamilia
    ? [
        { id: null as string | null, titulo: t("Comunes de la familia"), labels: repartoFamilia.comunes },
        ...repartoFamilia.miembros.map((m) => ({
          id: m.id as string | null,
          titulo: m.nombre.trim() || t("Miembro"),
          labels: repartoFamilia.porMiembro[m.id] ?? [],
        })),
      ]
        // TODAS las secciones, aunque estén vacías: al añadir un miembro, su parte
        // aparece sola y el gestor le atribuye documentos entrando en ella.
        .map((g) => {
          const suyos = e.documentos.filter((d) => (d.clienteId ?? null) === g.id && (d.tieneArchivo || d.estado !== "PENDIENTE"));
          return { ...g, casados: emparejarDocs(g.labels, suyos) };
        })
    : [];
  const usadosFamilia = new Set(
    gruposFamilia.flatMap((g) => g.casados).filter((d): d is NonNullable<typeof d> => Boolean(d)).map((d) => d.id),
  );
  const totalCasillasFamilia = repartoFamilia
    ? repartoFamilia.comunes.length + Object.values(repartoFamilia.porMiembro).reduce((a, l) => a + l.length, 0)
    : 0;
  const tarifaMult = tarifaAsignada(serviciosExp, e.serviciosAsignacion, nMiembrosExp);
  // Descuento del expediente sobre la tarifa YA multiplicada (nMiembros=1 aquí).
  // El pago final muestra el PENDIENTE real: si el anticipo ya se cobró (a precio pleno,
  // porque el descuento llegó después), el resto del descuento cae entero aquí — la ficha
  // debe enseñar lo mismo que emitirá /api/pagos, ni un céntimo más.
  const rebajaExp = aplicarDescuento(tarifaMult, 1, e.descuento);
  const tarifaExp = {
    anticipo: rebajaExp.anticipo,
    resto: restoPendiente(rebajaExp, anticipoPagado(e.facturasPago)),
  };
  // Override manual del expediente (si el gestor ajustó las tasas) o los del servicio,
  // ya multiplicados (override global ×N; los del servicio ×miembros de SU servicio).
  const suplidosBase = suplidosDeExpediente(e.suplidosOverride, serviciosExp);
  const suplidosExp = suplidosAsignados(e.suplidosOverride, serviciosExp, e.serviciosAsignacion, nMiembrosExp);

  // Documentos del cliente que aún faltan (no VALIDADO/PROCESANDO). El aviso persiste
  // mientras falten, en cualquier estado — el gestor puede haber avanzado igualmente.
  const docsPendientes = docsFaltantes(docsRequeridos, e.documentos);

  // Lectura del ciclo de vida: EL MISMO constructor que el tablero (progresoDeExpediente),
  // con el MISMO catálogo por sede. La ficha tenía su copia inline y divergía (Karim:
  // «2/3» en la tarjeta, «3/3» aquí). Un solo constructor: no puede volver a pasar.
  const progresoExp = progresoDeExpediente(
    {
      estado: e.estado, tipo: e.tipoEnum,
      servicioClave: e.servicioClave, serviciosExtra: e.serviciosExtra,
      docsExtra: e.docsExtra, // pedidos a mano: cuentan como requeridos
      documentos: e.documentos,
      formulariosGenerados: e.formulariosGenerados, tasaPath: e.tasaPath,
      fechaCita: e.cita?.fecha ?? null,
      // ⚠️ Pasarlo SIEMPRE: sin él la ficha seguía pidiendo «Enviar enlace al cliente»
      // en un expediente manual mientras la tarjeta del tablero decía lo correcto.
      // Mismo fallo que cuando el mapping del tablero tiraba `progreso`: si añades un
      // hecho a progresoDeExpediente, hay que pasarlo en LAS DOS llamadas.
      modoTrabajo: e.modoTrabajo,
      validadoAt: e.validadoManual ? "1" : null,
      cliente: (e.clienteFicha ?? {}) as Record<string, unknown>,
    },
    serviciosSede.map((sv) => ({ id: sv.id, docs: sv.docs, citaPresencial: sv.citaPresencial })),
  );

  // FLUJO v4: cierre y salida del expediente (columna `salida` opcional hasta la migración
  // supabase/flujo-v4.sql: si falta, la categoría se deduce del estado) — lectura aparte,
  // bajo RLS, para no tocar la cadena de replis del cargador.
  let cierre: { archivadoAt?: string | null; salida?: string | null } = {};
  {
    let rc = await supaRol.from("Expediente").select("archivadoAt, salida").eq("id", id).maybeSingle();
    if (rc.error) rc = await supaRol.from("Expediente").select("archivadoAt").eq("id", id).maybeSingle();
    cierre = (rc.data ?? {}) as typeof cierre;
  }
  const archivadoExp = Boolean(cierre.archivadoAt);
  const salidaExp = cierre.salida ?? null;
  const etiquetaSalidaExp = etiquetaSalida(salidaExp ?? salidaDeEstado(e.estado));
  const { data: wsRow } = await supaRol.from("Workspace").select("nombre").limit(1).maybeSingle();
  const fichaExp = (e.clienteFicha ?? {}) as Record<string, unknown>;
  // Mismo criterio que el portal (todo menos piso y NIE): lo que ningún documento trae aún.
  // Presentación en Mercurio: campos del solicitante para que la extensión rellene el formulario.
  const camposMercurioList = camposMercurioFlat(e.clienteFicha ?? {});
  const rellenosMercurio = camposMercurioList.filter((c) => c.value).length;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Doc(s) PROCESANDO → la ficha se refresca sola cada 5 s (tope 2 min). */}
      <AutoRefresh activo={e.documentos.some((d) => d.estado === "PROCESANDO")} />
      <Link href="/app/expedientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        {t("Expedientes")}
      </Link>

      {/* En-tête + position dans le pipeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {/* Móvil: título a ancho completo y acciones debajo; ≥sm: título + acciones en una fila. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {esEjemplo(e.referencia) && (
              <aside className="mb-3 rounded-xl border border-aproba-200 bg-aproba-50/70 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold text-aproba-800">{t("Expediente de ejemplo")}</p>
                <p className="mt-0.5 leading-relaxed">
                  {t("Los cuatro documentos ya están validados por la IA y la ficha está completa: pulsa «Generar formularios» y verás el EX-17 y la tasa 790 rellenados. Cuando ya lo hayas visto, bórralo.")}
                </p>
                <div className="mt-1.5"><EliminarEjemploButton /></div>
              </aside>
            )}
            <p className="font-mono text-xs text-slate-400">{e.referencia}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">{familia ? familia.nombre : e.clienteNombre}</h1>
            <p className="text-slate-500">{etiquetaServicios}{familia ? ` · ${e.clienteNombre}` : ` · ${e.clienteNacionalidad}`}</p>
            {/* También en familia (pedido por Juan): el cambio ajusta el precio base ×N como
                cualquier recálculo de la facturación familiar. */}
            <CambiarServicio
              expedienteId={e.id}
              servicios={servicios}
              actualClave={e.servicioClave ?? serviciosExp[0]?.id ?? null}
              extrasActuales={e.serviciosExtra}
              // Familiar: el «para quién» de cada servicio se decide AQUÍ (no en Cobro):
              // pilota los documentos de cada miembro, sus formularios y la tarifa ×N.
              miembros={familia ? familia.miembros.map((m) => ({ id: m.id, nombre: m.nombre })) : []}
              asignacionInicial={e.serviciosAsignacion}
            />
            {familia && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-aproba-50 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
                {t("Expediente familiar")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            <ExportarZipButton expedienteId={e.id} referencia={e.referencia} />
            <ArchivarButton id={e.id} />
            <EliminarExpedienteButton id={e.id} referencia={e.referencia} />
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <PhaseStepper activeEstado={e.estado} activeFase={progresoExp.fase} archivado={archivadoExp} salida={etiquetaSalidaExp ? t(etiquetaSalidaExp) : null} />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><span className="text-slate-400">{t("Asignado a")} </span><span className="font-medium text-slate-700">{e.asignadoA}</span></div>
          <div><span className="text-slate-400">{t("Creado")} </span><span className="font-medium text-slate-700">{e.creado}</span></div>
          {e.presentadoEl && <div><span className="text-slate-400">{t("Presentado")} </span><span className="font-medium text-slate-700">{e.presentadoEl}</span></div>}
          {e.fechaLimite && <div><span className="text-slate-400">{t("Fecha límite")} </span><span className="font-medium text-amber-700">{e.fechaLimite}</span></div>}
        </div>
      </div>

      {/* Completitud + ciclo — CARTA PROPIA bajo la cabecera, SIEMPRE visible: el botón
          cambia con la columna (listo → presentado → aceptado/denegado → archivar), así
          que la carta acompaña al expediente hasta el final. */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <ValidarExpediente
          id={e.id}
          referencia={e.referencia}
          estado={e.estado}
          fase={progresoExp.fase}
          completitud={progresoExp.completitud}
          archivado={archivadoExp}
          salida={salidaExp}
          // Popup de cierre: mismo criterio que el botón de pago final del CobrosPanel
          // (queda resto, sin factura final viva, sin plan de cuotas).
          finalizacion={{
            resto: tarifaExp.resto,
            puedeFacturar:
              tarifaExp.resto > 0
              && !e.facturasPago.some((f) => f.momento === "FINAL" && f.estado !== "ANULADA")
              && !e.facturasPago.some((f) => String(f.momento ?? "").startsWith("CUOTA_") && f.estado !== "ANULADA"),
            clienteEmail: e.clienteEmail ?? "",
          }}
        />
      </div>

      {/* Documentos del cliente pendientes — SOLO en la columna «1. Preparación»
          (pedido de Matthias): en «Preparado» y archivado el gestor ya
          decidió avanzar y el aviso solo metía ruido. */}
      {docsPendientes.length > 0 && progresoExp.fase === "preparacion" && !archivadoExp && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <div className="min-w-0 text-sm text-amber-800">
            {/* Icono en la MISMA línea que el título: centrar una columna con el icono
                a la izquierda dejaría el bloque visiblemente descentrado. */}
            <p className="flex items-center justify-center gap-2 font-semibold">
              <svg className="h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
              {t("Faltan documentos del cliente")} ({docsPendientes.length})
            </p>
            <p className="mt-0.5">{docsPendientes.join(" · ")}</p>
            <div className="flex justify-center"><RecordarDocsButton expedienteId={e.id} /></div>
          </div>
        </div>
      )}

      {/* Le parcours, de haut en bas */}
      <div className="mt-6 space-y-6">
        {/* Notas de trabajo del gestor («cita solicitada», «a la espera de apostillas»…) */}
        <SeccionPlegable id="notas" titulo={t("Notas")} resumen={notas.length > 0 ? `${notas.length}` : t("Sin notas")}>
          <NotasExpediente expedienteId={e.id} inicial={notas} />
        </SeccionPlegable>

        {/* Información del cliente: los MISMOS campos que pide el portal y que se ven en
            «Clientes» (lib/ficha.ts, fuente única). El gestor los lee y corrige aquí,
            sin salir del expediente que está preparando.
            FAMILIAR: no se enseña — repetiría la ficha del titular, que ya se edita
            miembro a miembro en «Familia» (el portal del cliente NO cambia). */}
        {!familia && (
        <SeccionPlegable
          id="informacion"
          titulo={t("Información")}
          // El resumen cuenta EXACTAMENTE los campos que la sección enseña (FICHA_CAMPOS,
          // los del portal y de «Clientes»). Con FICHA_KEYS decía «5/20» mientras se
          // veían 18 filas: el mismo error de denominador que ya nos costó dos rondas.
          resumen={(() => {
            const f = (e.clienteFicha ?? {}) as Record<string, unknown>;
            const total = FICHA_CAMPOS.length;
            const rellenos = FICHA_CAMPOS.filter((c) => String(f[c.k] ?? "").trim()).length;
            return rellenos === total ? t("Completa") : `${rellenos}/${total}`;
          })()}
          completa={FICHA_CAMPOS.every((c) => String(((e.clienteFicha ?? {}) as Record<string, unknown>)[c.k] ?? "").trim())}
        >
          <InformacionCliente
            ficha={(e.clienteFicha ?? {}) as ClienteFicha}
            clienteId={e.clienteId ?? null}
            oficinas={oficinasDespacho}
            portalToken={e.modoTrabajo === "manual" ? null : e.portalToken}
          />
        </SeccionPlegable>
        )}

        {/* Familia (expediente familiar): miembros + facturación familiar */}
        {familia && (
          <SeccionPlegable id="familia" titulo={t("Familia")} resumen={`${familia.miembros.length} ${t("miembros")}`}>
            <>
              <FamiliaExpedienteSection familia={familia} expedienteId={e.id} prefill={famPrefill} facturas={famFacturas} />
              {/* El enlace vivía dentro de «Información», que aquí ya no se enseña. */}
              {e.modoTrabajo !== "manual" && e.portalToken && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <EnlaceCliente portalToken={e.portalToken} />
                </div>
              )}
            </>
          </SeccionPlegable>
        )}

        {/* Documentos */}
        <div data-guia="documentos">
        <SeccionPlegable
          id="documentos"
          completa={progresoExp.docs.completo}
          titulo={`${t("Documentos")} (${e.documentos.length})`}
          // UNA métrica, la misma que la tarjeta del tablero: recibidos/REQUERIDOS.
          // «3/3 validados» aquí contra «2/3» en la tarjeta era contar cosas distintas
          // en dos sitios (lo señaló Matthias con Karim). Sin requisitos configurados,
          // repli al conteo de subidos.
          resumen={progresoExp.docs.requeridos > 0
            ? `${progresoExp.docs.recibidos}/${progresoExp.docs.requeridos} ${t("requeridos")}`
            : e.documentos.length > 0
              ? `${e.documentos.filter((d) => d.estado === "VALIDADO").length}/${e.documentos.length} ${t("validados")}`
              : undefined}
        >
          {despachoEncargo && (
            <p className="mb-3 -mt-1 text-xs text-slate-500">
              {t("Para firmar:")}{" "}
              <a href={`/api/expedientes/${e.id}/encargo?doc=hoja`} className="inline-block py-2 font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600 sm:py-0">{t("hoja de encargo (PDF)")}</a>
              {" · "}
              <a href={`/api/expedientes/${e.id}/encargo?doc=mandato`} className="inline-block py-2 font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600 sm:py-0">{t("mandato (PDF)")}</a>
            </p>
          )}
          {/* Las casillas del trámite SIEMPRE a la vista, en su orden, tenga o no el
              cliente su enlace: el gestor ve de un vistazo lo que falta y sube el
              archivo en su hueco (le llega por email o en mano). Cada documento
              subido consume UNA casilla; lo que no encaje en ninguna va después.
              Familia = por miembro (portal), aquí solo expedientes individuales. */}
          {/* Encabezado explícito: el gestor tiene que saber, sin recordarlo de memoria,
              qué papeles hay que reunir en ESTE expediente. */}
          {(familia ? totalCasillasFamilia > 0 : casillasFicha.length > 0) && (
            <p className="mb-2 -mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("Documentos requeridos")} · {familia ? totalCasillasFamilia : casillasFicha.length}
            </p>
          )}
          <div className="space-y-3">
            {(() => {
              const casillas = casillasFicha;
              // MISMO emparejador que el portal (lib/tramites): la etiqueta manda, el
              // tipo es el repli. Sin él, dos documentos propios (los dos OTRO) se
              // pisaban entre casillas.
              const utiles = e.documentos.filter((d) => d.tieneArchivo || d.estado !== "PENDIENTE");
              const casados = emparejarDocs(casillas, utiles);
              const usados = new Set(casados.filter((d): d is NonNullable<typeof d> => Boolean(d)).map((d) => d.id));
              const libres = e.documentos.filter((d) => !usados.has(d.id));
              const filas = casillas.map((label, idx) => {
                const doc = casados[idx];
                return doc
                  ? <DocumentoRow key={doc.id} d={doc} expedienteId={e.id} />
                  : <CasillaDocumentoGestor
                      key={`falta-${label}`}
                      expedienteId={e.id}
                      label={label}
                      // Solo se puede retirar lo que se pidió a mano: la lista del
                      // servicio se cambia en Ajustes, no expediente por expediente.
                      // Cualquier casilla se puede retirar de ESTE expediente (pedida
                      // a mano o del servicio); el catálogo del despacho no cambia.
                      quitable
                      docsExtra={e.docsExtra}
                    />;
              });
              // Lo demás: extras subidos por el gestor y, sin requisitos configurados,
              // la lista completa de siempre. Solo se descarta el hueco vacío que YA
              // representa una casilla de arriba (si no, saldría dos veces).
              const tiposEnCasillas = new Set(casillas.map(labelADocTipo));
              const extras = libres
                .filter((d) => d.tieneArchivo || d.estado !== "PENDIENTE" || !tiposEnCasillas.has(d.tipo ?? ""))
                // Familiar: lo que YA está en una sección de arriba no se repite aquí.
                .filter((d) => !usadosFamilia.has(d.id));
              // Nada que enseñar → nada: el bloque «elige los documentos» de abajo ya
              // dice lo que pasa (el marco vacío solo repetía la ausencia).
              return [...filas, ...extras.map((d) => <DocumentoRow key={d.id} d={d} expedienteId={e.id} />)];
            })()}
          </div>
          {/* MODO INTERNO: el gestor sube docs él mismo (cliente con docu ya en mano), sin enlace.
              Disponible en CUALQUIER etapa (una resolución llega en PRESENTADO, un TIE nuevo en
              FINALIZADO…): el pipeline solo promociona/regresa el estado en las etapas de
              recogida, así que subir tarde nunca mueve el expediente. Familia = por miembro
              (vía portal); aquí solo expedientes individuales. */}
          {/* FAMILIAR: una sección por ámbito — comunes del dossier y luego cada
              miembro, con SU casilla y SU zona de arrastre. El documento se guarda
              con el clienteId del miembro (o sin él si es común), que es justo lo que
              distingue las casillas del portal. */}
          {/* FAMILIAR: una sección por ámbito — comunes del dossier y luego cada
              miembro, con SU casilla y SU zona de arrastre. El documento se guarda con
              el clienteId del miembro (o sin él si es común): lo mismo que distingue
              las casillas del portal. */}
          {familia && (
            <div className="space-y-4">
              {gruposFamilia.map((g) => (
                <div key={g.id ?? "comunes"}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.titulo}</p>
                  <div className="space-y-3">
                    {g.labels.map((label, i) => {
                      const doc = g.casados[i];
                      return doc ? (
                        <DocumentoRow key={doc.id} d={doc} expedienteId={e.id} />
                      ) : (
                        <CasillaDocumentoGestor
                          key={`falta-${g.id ?? "c"}-${label}`}
                          expedienteId={e.id}
                          label={label}
                          miembroId={g.id}
                          quitable
                          docsExtra={e.docsExtra}
                        />
                      );
                    })}
                  </div>
                  <SubirDocumentoGestor expedienteId={e.id} miembroId={g.id} />
                </div>
              ))}
            </div>
          )}
          <DocumentosEsperados
            expedienteId={e.id}
            docsActuales={familia && repartoFamilia ? [...repartoFamilia.comunes, ...Object.values(repartoFamilia.porMiembro).flat()] : casillasFicha}
            docsTramite={docsRequeridos}
            docsExtra={e.docsExtra}
            sugerencias={sugerenciasDocs}
            nServicios={serviciosExp.length}
            esFamilia={Boolean(familia)}
          />
          {!familia && <SubirDocumentoGestor expedienteId={e.id} />}
        </SeccionPlegable>
        </div>

        {/* Formularios */}
        <SeccionPlegable
          id="formularios"
          completa={e.formularios.length > 0 || e.tieneTasa || tasaMiembrosIds.length > 0}
          titulo={t("Formularios")}
          resumen={e.formularios.length > 0 || e.tieneTasa || tasaMiembrosIds.length > 0 ? `${e.formularios.length + (e.tieneTasa ? 1 : 0) + tasaMiembrosIds.length} PDF` : t("Sin generar")}
          right={
            <Link href={`/app/expedientes/${e.id}/formularios`} data-guia="generar" className="-my-2 py-2 text-xs font-semibold text-aproba-700 hover:underline sm:my-0 sm:py-0">
              {e.formularios.length > 0 || e.tieneTasa || tasaMiembrosIds.length > 0 ? t("Ver / imprimir →") : t("Generar →")}
            </Link>
          }
        >
          {e.formularios.length > 0 || e.tieneTasa || tasaMiembrosIds.length > 0 ? (
            // Descarga DIRECTA del PDF oficial relleno (editable) + × para quitar cada uno.
            // Incluye la tasa 790-012 guardada. Familiar: chips → página (por solicitante).
            <FormulariosGeneradosChips expedienteId={e.id} formularios={e.formularios} esFamilia={Boolean(familia)} tieneTasa={e.tieneTasa} porMiembro={e.formulariosPorMiembro} miembros={solicitantesExp.map((m) => ({ id: m.id, nombre: m.nombre }))} tasaMiembros={tasaMiembrosIds} />
          ) : (
            // Nada generado. FAMILIAR (pedido de Matthias): SOLO los nombres de los
            // solicitantes — la generación vive en la página («Generar →» arriba); al
            // generar, los formularios de cada miembro aparecen bajo su nombre.
            familia ? (
              <div className="space-y-2">
                {solicitantesExp.map((m) => (
                  <p key={m.id} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {m.nombre}
                    <span className="font-normal normal-case tracking-normal text-slate-300">· {t("Sin generar")}</span>
                  </p>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <Link href={`/app/expedientes/${e.id}/formularios`} className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>
                  {t("Generar formularios")}
                </Link>
                <span className="text-xs text-slate-400">{t("EX + tasa 790-012, rellenados con los datos validados. Después podrás marcarlos como generados.")}</span>
              </div>
            )
          )}
        </SeccionPlegable>


        {/* Presentar en Mercurio — SIEMPRE visible (pedido de Matthias, 22/08): antes
            aparecía solo con formularios generados, y el gestor que trabaja fuera del
            orden previsto no la encontraba. */}
        <SeccionPlegable id="mercurio" titulo={t("Presentar en Mercurio")} completa={camposMercurioList.length > 0 && rellenosMercurio === camposMercurioList.length} resumen={`${rellenosMercurio}/${camposMercurioList.length} ${t("datos listos")}`}>
          <RellenarMercurio campos={camposMercurioList} referencia={e.referencia} expedienteId={e.id} rellenos={rellenosMercurio} total={camposMercurioList.length} ocultarTitulo />
        </SeccionPlegable>

        {/* Citas del expediente (22/08, pedido de Matthias): fecha, hora, lugar, quién
            acude y notas — un hecho editable en cualquier punto del trámite. */}
        <SeccionPlegable
          id="citas"
          completa={Boolean(e.cita.fecha)}
          titulo={t("Citas")}
          resumen={e.cita.fecha
            ? `${fmtFechaCorta(e.cita.fecha) ?? e.cita.fecha}${e.cita.hora ? ` · ${e.cita.hora}` : ""} · ${t(e.cita.quien === "gestor" ? "acude el gestor" : e.cita.quien === "ambos" ? "acuden ambos" : "acude el cliente")}`
            : t("Sin cita")}
        >
          <CitasPanel expedienteId={e.id} inicial={e.cita} quienPorDefecto={cita.citaQuien} />
        </SeccionPlegable>

        {/* Cobro */}
        <SeccionPlegable
          id="cobro"
          // Completo = COBRADO: hay algo pagado y nada pendiente. Un servicio sin tarifa
          // tampoco lleva coca — una coca verde sobre una sección vacía se lee «pagado»,
          // y eso sería mentira sobre dinero, que es donde menos se puede mentir.
          completa={(() => {
            const pendiente = e.facturasPago.filter((f) => f.estado === "EMITIDA" || f.estado === "VENCIDA").length;
            const pagado = e.facturasPago.filter((f) => f.estado === "PAGADA").length;
            return pendiente === 0 && pagado > 0;
          })()}
          titulo={t("Cobro del expediente")}
          resumen={(() => {
            const pendiente = e.facturasPago.filter((f) => f.estado === "EMITIDA" || f.estado === "VENCIDA").reduce((a, f) => a + f.total, 0);
            const pagado = e.facturasPago.filter((f) => f.estado === "PAGADA").reduce((a, f) => a + f.total, 0);
            if (pendiente > 0) return `${eur(r2(pendiente))} ${t("pendiente")}`;
            if (pagado > 0) return t("Al día");
            const prevista = tarifaExp.anticipo + tarifaExp.resto;
            return prevista > 0 ? eur(r2(prevista)) : undefined;
          })()}
        >
        <CobrosPanel
          ocultarTitulo
          ocultarCobroFuera
          expedienteId={e.id}
          // Expediente familiar: el servicio es POR MIEMBRO — mismo multiplicador que
          // el portal y la factura automática; si no, el gestor sub-factura el pago final.
          anticipo={tarifaExp.anticipo}
          resto={tarifaExp.resto}
          facturas={e.facturasPago}
          clienteNombre={e.clienteNombre === "—" ? undefined : e.clienteNombre}
          conceptoFinal={`Liquidación final — ${etiquetaServicios} (${e.referencia})`}
          conceptoAnticipo={`Anticipo — ${etiquetaServicios} (${e.referencia})`}
          suplidos={suplidosExp}
        />
        {/* Tasas y suplidos ajustables por expediente (pedido por Juan): alimentan hoja de
            encargo, primera factura y presupuesto. Solo cuando hay cobro o tasas que ajustar. */}
        {(tarifa.anticipo > 0 || tarifa.resto > 0 || suplidosBase.length > 0 || e.suplidosOverride !== null) && (
          <div className="mt-3 flex flex-wrap items-start justify-center gap-x-4 gap-y-1">
            <DescuentoExpediente expedienteId={e.id} inicial={e.descuento} tarifa={tarifaMult} nMiembros={1} />
            <SuplidosExpediente expedienteId={e.id} inicial={suplidosBase} esOverride={e.suplidosOverride !== null} />
          </div>
        )}
        {/* Puerta de salida al final del bloque, después de los ajustes. */}
        <p className="mt-3 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400">
          {t("¿Cobro fuera de la plataforma?")}{" "}
          {(() => {
            // Momento aún sin factura → registrar el cobro externo SOBRE el expediente
            // (misma factura de anticipo/final, nacida PAGADA). Si ya está todo facturado,
            // queda la salida clásica: factura manual suelta.
            const pagoAnt = e.facturasPago.find((f) => f.momento === "ANTICIPO");
            const pagoFin = e.facturasPago.find((f) => f.momento === "FINAL");
            const nCuotas = e.facturasPago.filter((f) => String(f.momento ?? "").startsWith("CUOTA_") && f.estado !== "ANULADA").length;
            const abierto = (tarifaExp.anticipo > 0 && !pagoAnt) || (tarifaExp.resto > 0 && !pagoFin && nCuotas === 0);
            return abierto ? <CobroExternoLink /> : (
              <Link href="/app/facturas/nueva" className="inline-block py-2 font-semibold text-aproba-700 hover:underline sm:py-0">
                {t("Crea la factura manualmente")}
              </Link>
            );
          })()}.
        </p>
        </SeccionPlegable>

        {/* Historial */}
        <SeccionPlegable id="historial" titulo={t("Historial")} resumen={`${e.eventos.length}`}>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <ol className="space-y-4">
              {e.eventos.map((ev, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2 w-2 rounded-full bg-aproba-500" />
                    {i < e.eventos.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="-mt-0.5 pb-1">
                    <p className="text-sm text-slate-800">{ev.titulo}</p>
                    <p className="text-xs text-slate-400">{ev.fecha}{ev.autor ? ` · ${ev.autor}` : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </SeccionPlegable>

        {/* Traspasar el expediente — al final de la ficha: es lo último que se hace
            con un trámite, cuando ya lo has mirado y decides que lo lleve otro. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Asignado a")}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("Quién lleva este expediente. Puedes traspasarlo a cualquier persona del equipo.")}</p>
          {/* Conteneur centreur : le <select> garde sa largeur de contenu. */}
          <div className="mt-3 flex justify-center">
            <AsignarExpediente expedienteId={e.id} miembros={miembrosEquipo} inicial={e.asignadoAId ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
