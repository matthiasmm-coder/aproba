"use client";

import { useState } from "react";

// Tarjeta gestor: obtiene (creándolo si hace falta) el enlace del portal familiar y permite
// copiarlo para enviarlo al titular. Un solo enlace para toda la familia.
export function EnlaceFamilia({ familiaId }: { familiaId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function obtener() {
    setCargando(true); setError(null);
    try {
      const res = await fetch(`/api/familias/${familiaId}/enlace`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo generar el enlace.");
      setUrl(`${window.location.origin}/f/${d.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el enlace.");
    } finally {
      setCargando(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* noop */ }
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-700">Enlace para la familia</h2>
      <p className="mt-0.5 text-xs text-slate-500">Un único enlace: el titular rellena los datos de todos los miembros y sube los documentos comunes.</p>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        {!url ? (
          <button onClick={obtener} disabled={cargando} className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            {cargando ? "Generando…" : "Obtener enlace"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-cream-50/50 px-3 py-2 text-sm text-slate-600 outline-none" />
            <button onClick={copiar} className="shrink-0 rounded-lg border border-aproba-300 px-3 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50">{copiado ? "Copiado ✓" : "Copiar"}</button>
            <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-800">Abrir →</a>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
