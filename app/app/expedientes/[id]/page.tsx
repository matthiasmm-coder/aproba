import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchServiciosConfig } from "@/lib/data/config";
import { TIPO_A_SERVICIO } from "@/lib/tramites";
import { DOC_ESTADO_META, ESTADO_META, type Documento } from "@/lib/types";
import { ArchivarButton } from "@/components/archivar-button";
import { PresentarButton } from "@/components/presentar-button";
import { CobrosPanel } from "@/components/cobros-panel";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Expediente" };

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? "bg-aproba-500" : value >= 0.7 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{pct}%</span>
    </div>
  );
}

function DocumentoRow({ d, expedienteId, t }: { d: Documento; expedienteId: string; t: (s: string) => string }) {
  const meta = DOC_ESTADO_META[d.estado];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream-50 text-slate-400">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          </span>
          <span className="font-medium text-slate-900">{d.tipoLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {d.tieneArchivo && (
            <a
              href={`/api/expedientes/${expedienteId}/documentos/${d.id}`}
              download
              title={d.nombreArchivo ? `${t("Descargar")} ${d.nombreArchivo}` : t("Descargar el documento del cliente")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-300 hover:bg-aproba-50 hover:text-aproba-700"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              {t("Descargar")}
            </a>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
        </div>
      </div>

      {d.extraction && (
        <div className="mt-4 rounded-lg bg-cream-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Datos extraídos por IA")}</span>
            <ConfidenceBar value={d.extraction.confianzaGlobal} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {d.extraction.campos.map((c) => (
              <div key={c.label} className="min-w-0">
                <dt className="text-xs text-slate-400">{c.label}</dt>
                <dd className="truncate font-mono text-sm text-slate-800">{c.value}</dd>
              </div>
            ))}
          </dl>
          {d.extraction.alertas.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>
              {d.extraction.alertas.join(" · ")}
            </div>
          )}
        </div>
      )}

      {d.estado === "PROCESANDO" && (
        <p className="mt-3 text-sm text-amber-600">⏳ {t("Extrayendo datos con IA…")}</p>
      )}
      {d.estado === "PENDIENTE" && (
        <p className="mt-3 text-sm text-slate-400">{t("Esperando que el cliente lo suba.")}</p>
      )}
    </div>
  );
}

export default async function ExpedienteDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getT();
  const e = await fetchExpedienteDetalle(id);
  if (!e) notFound();

  // Tarifa del servicio (config du workspace) pour le panneau Cobros.
  const { servicios } = await fetchServiciosConfig();
  const servicio = servicios.find((s) => s.id === TIPO_A_SERVICIO[e.tipoEnum]);

  const meta = ESTADO_META[e.estado];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/expedientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        {t("Expedientes")}
      </Link>

      {/* En-tête */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-slate-400">{e.referencia}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">{e.clienteNombre}</h1>
            <p className="text-slate-500">{e.tipoLabel} · {e.clienteNacionalidad}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${meta.pill}`}>{t(meta.label)}</span>
            {e.estado === "FORM_GENERADO" && <PresentarButton id={e.id} />}
            <ArchivarButton id={e.id} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-slate-100 pt-4 text-sm">
          <div><span className="text-slate-400">{t("Asignado a")} </span><span className="font-medium text-slate-700">{e.asignadoA}</span></div>
          <div><span className="text-slate-400">{t("Creado")} </span><span className="font-medium text-slate-700">{e.creado}</span></div>
          {e.fechaLimite && <div><span className="text-slate-400">{t("Fecha límite")} </span><span className="font-medium text-amber-700">{e.fechaLimite}</span></div>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Documentos */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("Documentos")} ({e.documentos.length})
          </h2>
          <div className="space-y-3">
            {e.documentos.length > 0 ? (
              e.documentos.map((d) => <DocumentoRow key={d.id} d={d} expedienteId={e.id} t={t} />)
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                {t("Sin documentos en este expediente.")}
              </div>
            )}
          </div>

          {/* Formularios */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Formularios")}</h2>
              <Link href={`/app/expedientes/${e.id}/formularios`} className="text-sm font-semibold text-aproba-700 hover:underline">
                {e.formularios.length > 0 ? t("Ver / imprimir →") : t("Generar →")}
              </Link>
            </div>
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
          </div>
        </div>

        {/* Cobros + Timeline */}
        <div>
          <CobrosPanel
            referencia={e.referencia}
            anticipo={servicio?.anticipo ?? 0}
            resto={servicio?.resto ?? 0}
            facturas={e.facturasPago}
          />
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Historial")}</h2>
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
        </div>
      </div>
    </div>
  );
}
