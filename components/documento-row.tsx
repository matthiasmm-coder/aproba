"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_ESTADO_META, type Documento } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

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

// Tarjeta de un documento del expediente. Los datos extraídos por IA se muestran plegados
// por defecto (compacidad) y se despliegan al pulsar la cabecera (chevron). El botón
// «Descargar» va fuera del toggle para que no lo abra/cierre.
export function DocumentoRow({ d, expedienteId }: { d: Documento; expedienteId: string }) {
  const t = useT();
  const router = useRouter();
  const meta = DOC_ESTADO_META[d.estado];
  const tieneDatos = Boolean(d.extraction);
  const [abierto, setAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // El gestor descarta el documento (archivo equivocado, o validado por la IA pero
  // no aceptable para el despacho): el hueco vuelve a «pendiente» para el cliente.
  async function eliminar() {
    if (!(await confirmar({ mensaje: t("¿Eliminar este documento? El cliente podrá volver a subirlo desde su enlace."), peligro: true, confirmarLabel: t("Eliminar") }))) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/documentos/${d.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo eliminar el documento.")); }
      router.refresh();
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : t("No se pudo eliminar el documento."));
      setEliminando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      {/* Móvil: nombre del documento a ancho completo y acciones debajo (antes «Certificado de e…»);
          ≥sm: la fila única de siempre — la versión de escritorio no cambia. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <button
          type="button"
          onClick={() => tieneDatos && setAbierto((a) => !a)}
          disabled={!tieneDatos}
          aria-expanded={tieneDatos ? abierto : undefined}
          title={tieneDatos ? (abierto ? t("Ocultar datos extraídos") : t("Ver datos extraídos")) : undefined}
          className="group flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream-50 text-slate-400">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          </span>
          <span className="min-w-0 font-medium leading-snug text-slate-900 line-clamp-2 group-hover:text-aproba-700 sm:line-clamp-1">{d.tipoLabel}</span>
          {tieneDatos && (
            <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-aproba-600 ${abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
          {d.tieneArchivo && (
            <a
              href={`/api/expedientes/${expedienteId}/documentos/${d.id}`}
              download
              title={d.nombreArchivo ? `${t("Descargar")} ${d.nombreArchivo}` : t("Descargar el documento del cliente")}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-300 hover:bg-aproba-50 hover:text-aproba-700 sm:min-h-0"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
              {t("Descargar")}
            </a>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
          {(d.tieneArchivo || d.estado !== "PENDIENTE") && (
            <button
              type="button"
              onClick={eliminar}
              disabled={eliminando}
              title={t("Eliminar el documento (el cliente podrá volver a subirlo)")}
              aria-label={t("Eliminar el documento (el cliente podrá volver a subirlo)")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:h-7 sm:w-7"
            >
              {eliminando ? (
                <span className="text-xs">…</span>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
              )}
            </button>
          )}
        </div>
      </div>
      {errorEliminar && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{errorEliminar}</p>}

      {tieneDatos && abierto && d.extraction && (
        <div className="mt-4 rounded-lg bg-cream-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Datos extraídos por IA")}</span>
            <ConfidenceBar value={d.extraction.confianzaGlobal} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {d.extraction.campos.map((c) => (
              <div key={c.label} className="min-w-0">
                <dt className="text-xs text-slate-400">{c.label}</dt>
                <dd className="truncate font-mono text-sm text-slate-800">{c.value}</dd>
              </div>
            ))}
          </dl>
          {d.extraction.alertas.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" /><path d="M12 9v4M12 17h.01" /></svg>
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
