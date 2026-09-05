"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { PresupuestoModal, type PresupuestoPrefill } from "@/components/servicios-implantacion";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";
import { Cohete } from "@/components/cohete";

// VENTANA «Aproba Despegue» (05/09/2026, rediseño de la tarde): salta UNA vez, justo
// después de generar los formularios del expediente de EJEMPLO. Cuatro beneficios en dos
// palabras cada uno, sin precio (decisión de Matthias: el precio va en el presupuesto que
// él revisa y reenvía). Si acepta, el formulario de la landing, prellenado con la sesión.
const KEY = "aproba.despegue.visto";

export function DespegueModal({ prefill, onClose, coheteUrl = null }: { prefill: PresupuestoPrefill; onClose: () => void; coheteUrl?: string | null }) {
  const [paso, setPaso] = useState<"pregunta" | "formulario">("pregunta");
  useEffect(() => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } }, []);
  if (paso === "formulario") return <PresupuestoModal onClose={onClose} prefill={prefill} origen="app-ejemplo" sinPrecio />;
  return <Pregunta onSi={() => setPaso("formulario")} onNo={onClose} coheteUrl={coheteUrl} />;
}

export function despegueYaVisto(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

const IconoCuenta = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
const IconoClientes = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>;
const IconoEquipo = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>;
const IconoSoporte = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>;

function Pregunta({ onSi, onNo, coheteUrl }: { onSi: () => void; onNo: () => void; coheteUrl: string | null }) {
  const [pngOk, setPngOk] = useState(true); // repli SVG si el PNG no existe
  const t = useT();
  useScrollBloqueado();
  const beneficios: { icono: React.ReactNode; titulo: string; detalle: string }[] = [
    { icono: IconoCuenta, titulo: t("Cuenta configurada"), detalle: t("servicios, tarifas y cobros") },
    { icono: IconoClientes, titulo: t("Clientes migrados"), detalle: t("y expedientes en curso") },
    { icono: IconoEquipo, titulo: t("Equipo formado"), detalle: t("sobre tus propios casos") },
    { icono: IconoSoporte, titulo: t("Soporte prioritario"), detalle: t("con interlocutor dedicado") },
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="despegue-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onNo}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 bg-gradient-to-br from-aproba-50 to-white px-6 pt-6 sm:px-8">
          {coheteUrl && pngOk ? <img src={coheteUrl} alt="" onError={() => setPngOk(false)} className="h-24 w-24 shrink-0 object-contain" /> : <Cohete className="h-20 w-20 shrink-0" />}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-aproba-700">Aproba Despegue</p>
            <h2 id="despegue-titulo" className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">{t("Rápido y sin errores")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("Tu despacho funcionando en días, no en semanas.")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 px-6 pt-5 sm:px-8">
          {beneficios.map((b) => (
            <div key={b.titulo} className="rounded-xl border border-slate-200 bg-cream-50/60 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-aproba-100 text-aproba-700">{b.icono}</span>
              <p className="mt-2 text-sm font-bold text-slate-900">{b.titulo}</p>
              <p className="text-xs text-slate-500">{b.detalle}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-center sm:px-8">
          <button type="button" onClick={onNo} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900">{t("Ahora no")}</button>
          <button type="button" onClick={onSi} className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">{t("Quiero el presupuesto")}</button>
        </div>
      </div>
    </div>
  );
}
