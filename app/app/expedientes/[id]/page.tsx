import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchFamiliaDetalle, fetchFacturaFamiliaPrefill, fetchFacturasDeFamilia } from "@/lib/data/familias";
import { FamiliaExpedienteSection } from "@/components/familia-expediente-section";
import { fetchServiciosConfig } from "@/lib/data/config";
import { TIPO_A_SERVICIO, docsFaltantes } from "@/lib/tramites";
import { RecordarDocsButton } from "@/components/recordar-docs-button";
import { ESTADO_META } from "@/lib/types";
import { ArchivarButton } from "@/components/archivar-button";
import { ExportarZipButton } from "@/components/exportar-zip-button";
import { DocumentoRow } from "@/components/documento-row";
import { CobrosPanel } from "@/components/cobros-panel";
import { RellenarMercurio } from "@/components/rellenar-mercurio";
import { PhaseStepper } from "@/components/phase-stepper";
import { DriverBanner } from "@/components/driver-banner";
import { CambiarServicio } from "@/components/cambiar-servicio";
import { camposMercurioFlat } from "@/lib/mercurio";
import { CentinelaPanel } from "@/components/centinela-panel";
import { AutoRefresh } from "@/components/auto-refresh";
import { fetchUltimaRevision } from "@/lib/centinela";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Expediente" };

// Encabezado de sección (neutro — el verde se reserva al stepper y al driver).
function SeccionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-700">{children}</span>
      {right}
    </div>
  );
}

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
  const [t, e, { servicios }, revision] = await Promise.all([
    getT(),
    fetchExpedienteDetalle(id),
    fetchServiciosConfig(),
    createSupabaseServer().then((sb) => fetchUltimaRevision(sb, id)),
  ]);
  if (!e) notFound();

  const despachoEncargo = await encargoActivado();

  // Expediente FAMILIAR (Expediente.familiaId): miembros + facturación familiar en la ficha.
  const [familia, famPrefill, famFacturas] = e.familiaId
    ? await Promise.all([fetchFamiliaDetalle(e.familiaId), fetchFacturaFamiliaPrefill(e.familiaId), fetchFacturasDeFamilia(e.familiaId)])
    : [null, null, []];
  // On retrouve le service par sa clave mémorisée (gère les services custom), avec repli
  // sur le mapping par type pour les anciens expedientes sans servicioClave.
  const servicio = servicios.find((s) => s.id === (e.servicioClave ?? TIPO_A_SERVICIO[e.tipoEnum]));

  // Documentos del cliente que aún faltan (no VALIDADO/PROCESANDO). El aviso persiste
  // mientras falten, en cualquier estado — el gestor puede haber avanzado igualmente.
  const docsPendientes = docsFaltantes(servicio?.docs ?? [], e.documentos);

  const meta = ESTADO_META[e.estado];

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{e.referencia}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">{familia ? familia.nombre : e.clienteNombre}</h1>
            <p className="text-slate-500">{servicio?.label?.trim() || e.tipoLabel}{familia ? ` · ${e.clienteNombre}` : ` · ${e.clienteNacionalidad}`}</p>
            {!familia && <CambiarServicio expedienteId={e.id} servicios={servicios} actualClave={e.servicioClave ?? null} />}
            {familia && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-aproba-50 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
                {t("Expediente familiar")}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${meta.pill}`}>{t(meta.label)}</span>
            <ExportarZipButton expedienteId={e.id} referencia={e.referencia} />
            <ArchivarButton id={e.id} />
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <PhaseStepper activeEstado={e.estado} />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><span className="text-slate-400">{t("Asignado a")} </span><span className="font-medium text-slate-700">{e.asignadoA}</span></div>
          <div><span className="text-slate-400">{t("Creado")} </span><span className="font-medium text-slate-700">{e.creado}</span></div>
          {e.fechaLimite && <div><span className="text-slate-400">{t("Fecha límite")} </span><span className="font-medium text-amber-700">{e.fechaLimite}</span></div>}
        </div>
      </div>

      {/* Driver : la flèche déclenche directement l'action suivante */}
      <DriverBanner
        id={e.id}
        estado={e.estado}
        citaPresencial={Boolean(servicio?.citaPresencial)}
        citaQuien={servicio?.citaQuien ?? "cliente"}
        portalToken={e.portalToken}
        formulariosHref={`/app/expedientes/${e.id}/formularios`}
        revision={revision ? { verdicto: revision.verdicto, rojos: revision.hallazgos.filter((h) => h.severidad === "ROJO").length } : null}
      />

      {/* Alerta persistente: documentos del cliente aún pendientes (en cualquier estado). */}
      {docsPendientes.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
          <div className="min-w-0 text-sm text-amber-800">
            <p className="font-semibold">{t("Faltan documentos del cliente")} ({docsPendientes.length})</p>
            <p className="mt-0.5">{docsPendientes.join(" · ")}</p>
            <p className="mt-1 text-xs text-amber-700">{t("El cliente puede enviarlos desde su enlace en cualquier momento, aunque hayas avanzado de paso.")}</p>
            <RecordarDocsButton expedienteId={e.id} />
          </div>
        </div>
      )}

      {/* Le parcours, de haut en bas */}
      <div className="mt-6 space-y-6">
        {/* Familia (expediente familiar): miembros + facturación familiar */}
        {familia && (
          <FamiliaExpedienteSection familia={familia} solicitanteNombre={e.clienteNombre} prefill={famPrefill} facturas={famFacturas} />
        )}

        {/* Documentos */}
        <section>
          <SeccionHeader>{t("Documentos")} ({e.documentos.length})</SeccionHeader>
          {despachoEncargo && (
            <p className="mb-3 -mt-1 text-xs text-slate-500">
              {t("Para firmar:")}{" "}
              <a href={`/api/expedientes/${e.id}/encargo?doc=hoja`} className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">{t("hoja de encargo (PDF)")}</a>
              {" · "}
              <a href={`/api/expedientes/${e.id}/encargo?doc=mandato`} className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">{t("mandato (PDF)")}</a>
            </p>
          )}
          <div className="space-y-3">
            {e.documentos.length > 0 ? (
              e.documentos.map((d) => <DocumentoRow key={d.id} d={d} expedienteId={e.id} />)
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                {t("Sin documentos en este expediente.")}
              </div>
            )}
          </div>
        </section>

        {/* Formularios */}
        <section>
          <SeccionHeader right={
            <Link href={`/app/expedientes/${e.id}/formularios`} className="text-xs font-semibold text-aproba-700 hover:underline">
              {e.formularios.length > 0 ? t("Ver / imprimir →") : t("Generar →")}
            </Link>
          }>{t("Formularios")}</SeccionHeader>
          {e.formularios.length > 0 ? (
            <Link href={`/app/expedientes/${e.id}/formularios`} className="flex flex-wrap gap-3">
              {e.formularios.map((f) => (
                <span key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 transition hover:border-aproba-300 hover:shadow-sm">
                  <svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  <span className="text-sm font-medium text-slate-700">{f.tipo}</span>
                  <span className="text-xs text-aproba-700">PDF</span>
                </span>
              ))}
            </Link>
          ) : (
            <Link href={`/app/expedientes/${e.id}/formularios`} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
              <svg className="h-5 w-5 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>
              {t("Generar EX + 790-012 desde los datos validados")}
            </Link>
          )}
        </section>

        {/* El Funcionario Fantasma: revisión «como Extranjería» — SU sitio es justo antes
            de presentar (dossier completo → revisar → Mercurio). El driver ancla aquí. */}
        <CentinelaPanel expedienteId={e.id} inicial={revision} />

        {/* Presentar en Mercurio — solo cuando hay formularios que presentar (antes de
            FORM_GENERADO el encarte es prematuro y desvía del siguiente paso real). */}
        {["FORM_GENERADO", "PRESENTADO", "RESUELTO", "CITA_HUELLAS", "FINALIZADO"].includes(e.estado) && (
          <RellenarMercurio campos={camposMercurioList} referencia={e.referencia} rellenos={rellenosMercurio} total={camposMercurioList.length} />
        )}

        {/* Cobro */}
        <CobrosPanel
          expedienteId={e.id}
          // Expediente familiar: el servicio es POR MIEMBRO — mismo multiplicador que
          // el portal y la factura automática; si no, el gestor sub-factura el pago final.
          anticipo={(servicio?.anticipo ?? 0) * Math.max(1, familia?.miembros.length ?? 1)}
          resto={(servicio?.resto ?? 0) * Math.max(1, familia?.miembros.length ?? 1)}
          facturas={e.facturasPago}
          clienteNombre={e.clienteNombre === "—" ? undefined : e.clienteNombre}
          conceptoFinal={`Liquidación final — ${servicio?.label?.trim() || e.tipoLabel} (${e.referencia})`}
        />

        {/* Historial */}
        <section>
          <SeccionHeader>{t("Historial")}</SeccionHeader>
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
        </section>
      </div>
    </div>
  );
}
