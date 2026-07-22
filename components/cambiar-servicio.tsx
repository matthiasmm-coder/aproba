"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

type Svc = { id: string; label: string };

// El gestor corrige los SERVICIOS del expediente desde la ficha: el principal (pilota el
// trámite/encargo) y los adicionales (suman documentos, formularios y tarifa). Discreto:
// un enlace que despliega selector + chips. POST a /api/expedientes/[id]/servicio.
export function CambiarServicio({ expedienteId, servicios, actualClave, extrasActuales = [] }: {
  expedienteId: string; servicios: Svc[]; actualClave: string | null; extrasActuales?: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(actualClave ?? "");
  const [extras, setExtras] = useState<string[]>(extrasActuales);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelDe = (id: string) => servicios.find((s) => s.id === id)?.label ?? id;
  const disponibles = servicios.filter((s) => s.id !== clave && !extras.includes(s.id));

  async function guardar() {
    const svc = servicios.find((s) => s.id === clave);
    if (!svc) { setError(t("Elige un servicio.")); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/servicio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, label: svc.label, extras: extras.filter((x) => x !== clave) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo cambiar el servicio."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo cambiar el servicio."));
    } finally { setBusy(false); }
  }

  if (!abierto) {
    return (
      <button onClick={() => { setClave(actualClave ?? ""); setExtras(extrasActuales); setError(null); setAbierto(true); }} className="-my-2 mt-1 py-2 text-xs font-medium text-aproba-700 hover:underline sm:my-0 sm:mt-1 sm:py-0">
        {extrasActuales.length > 0 ? t("Cambiar servicios") : t("Cambiar servicio")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("Servicio del expediente")} value={clave} onChange={(e) => { const v = e.target.value; setClave(v); setExtras((xs) => xs.filter((x) => x !== v)); }} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100">
          <option value="" disabled>{t("Elige un servicio…")}</option>
          {servicios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={guardar} disabled={busy} className="min-h-[36px] rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300 sm:min-h-0">{busy ? "…" : t("Guardar")}</button>
        <button onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="-my-2 py-2 text-xs text-slate-400 transition hover:text-slate-600 sm:my-0 sm:py-0">{t("Cancelar")}</button>
      </div>
      {/* Servicios adicionales: suman sus documentos, formularios y tarifa al expediente. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {extras.map((x) => (
          <span key={x} className="inline-flex items-center overflow-hidden rounded-full bg-slate-100 text-xs font-medium text-slate-700">
            <span className="py-1 pl-2.5 pr-1">{labelDe(x)}</span>
            <button onClick={() => setExtras((xs) => xs.filter((y) => y !== x))} disabled={busy} aria-label={`${t("Quitar")} ${labelDe(x)}`} title={`${t("Quitar")} ${labelDe(x)}`} className="self-stretch px-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
              <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
        ))}
        {disponibles.length > 0 && (
          <select value="" disabled={busy} aria-label={t("Añadir servicio adicional")} onChange={(e) => { if (e.target.value) setExtras((xs) => [...xs, e.target.value]); }} className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 outline-none focus:border-aproba-600 disabled:opacity-50">
            <option value="">{t("+ Añadir servicio…")}</option>
            {disponibles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>
      <p className="text-[11px] text-slate-400">{t("El principal define el trámite; los adicionales suman documentos y honorarios.")}</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
