"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Descarga TODO el expediente (ficha + documentos + formularios + facturas) en un .zip.
export function ExportarZipButton({ expedienteId, referencia }: { expedienteId: string; referencia: string }) {
  const t = useT();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/exportar`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo exportar el expediente.")); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${referencia}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo exportar el expediente."));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={exportar}
        disabled={cargando}
        title={t("Descarga ficha, documentos, formularios y facturas en un .zip")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-aproba-300 hover:text-aproba-700 disabled:opacity-60"
      >
        {cargando ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        )}
        {cargando ? t("Preparando…") : t("Exportar")}
      </button>
      {error && <p role="alert" className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
