"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

// MEMORIA DE ACTIVIDAD (art. 8.1.f de la Orden ISM/164/2026): las entidades inscritas
// en el Registro de Colaboradores de Extranjería deben aportarla al pedir la prórroga
// de su inscripción. Aquí se elige el período, se ven las cifras y se descarga el PDF.
// La vista previa existe a propósito: nadie manda a la Administración un documento que
// no ha visto antes, y así se comprueba el período sin abrir el PDF.

type Memoria = {
  expedientesTramitados: number;
  expedientesIniciados: number;
  expedientesPresentados: number;
  personasAtendidas: number;
  procedimientos: { label: string; n: number }[];
  actuaciones: { label: string; n: number }[];
  truncada?: boolean;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function MemoriaActividad() {
  const t = useT();
  const [desde, setDesde] = useState(`${hoyISO().slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(hoyISO());
  const [datos, setDatos] = useState<Memoria | null>(null);
  const [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangoInvalido = desde > hasta;
  // Cada cambio de fecha lanza una consulta; si una antigua responde DESPUÉS de la
  // última, no debe pisarla (las cifras no corresponderían al período mostrado).
  const peticion = useRef(0);

  const cargar = useCallback(async () => {
    if (desde > hasta) { setDatos(null); return; }
    const mia = ++peticion.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/memoria?desde=${desde}&hasta=${hasta}&formato=json`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo calcular la memoria.")); }
      const j = await res.json();
      if (mia === peticion.current) setDatos(j);
    } catch (e) {
      if (mia !== peticion.current) return;
      setDatos(null);
      setError(e instanceof Error ? e.message : t("No se pudo calcular la memoria."));
    } finally {
      if (mia === peticion.current) setCargando(false);
    }
  }, [desde, hasta, t]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function descargar() {
    setBajando(true);
    setError(null);
    try {
      const res = await fetch(`/api/memoria?desde=${desde}&hasta=${hasta}`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo generar la memoria.")); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `memoria_actividad_${desde}_${hasta}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo generar la memoria."));
    } finally {
      setBajando(false);
    }
  }

  const cifras: [string, number][] = datos
    ? [
        [t("Expedientes tramitados"), datos.expedientesTramitados],
        [t("Iniciados en el período"), datos.expedientesIniciados],
        [t("Presentados"), datos.expedientesPresentados],
        [t("Personas atendidas"), datos.personasAtendidas],
      ]
    : [];

  return (
    <div>
      <p className="mx-auto mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
        {t("Expedientes, procedimientos y actuaciones de un período, en un PDF. Es lo que pide el artículo 8.1.f de la Orden ISM/164/2026 al renovar la inscripción como entidad colaboradora.")}
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-center gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">{t("Desde")}</span>
          <input
            type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">{t("Hasta")}</span>
          <input
            type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-800"
          />
        </label>
        <button
          onClick={descargar}
          disabled={bajando || cargando || rangoInvalido}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60"
        >
          {bajando ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          )}
          {bajando ? t("Preparando…") : t("Descargar memoria en PDF")}
        </button>
      </div>

      {rangoInvalido && (
        <p role="alert" className="mt-3 text-sm text-red-700">{t("La fecha inicial es posterior a la final.")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {datos && !rangoInvalido && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {cifras.map(([label, n]) => (
              <div key={label}>
                <p className="text-2xl font-bold tracking-tightest text-aproba-700">{n}</p>
                <p className="mt-0.5 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          {datos.procedimientos.length > 0 && (
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
              {datos.procedimientos.length} {datos.procedimientos.length === 1 ? t("procedimiento") : t("procedimientos")}
              {" · "}
              {datos.actuaciones.reduce((s, a) => s + a.n, 0)} {t("actuaciones registradas")}
            </p>
          )}
          {datos.expedientesTramitados === 0 && (
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
              {t("No hay actividad registrada en este período.")}
            </p>
          )}
          {datos.truncada && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("Tu histórico supera el máximo de esta consulta: acorta el período para obtener cifras completas.")}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        {t("El PDF solo lleva cifras agregadas: ningún dato personal de las personas atendidas.")}
      </p>
    </div>
  );
}
