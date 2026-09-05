"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { PresupuestoModal, type PresupuestoPrefill } from "@/components/servicios-implantacion";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// VENTANA «¿Quieres ir más rápido?» (05/09/2026). Salta UNA vez, justo después de que
// el prospecto genere los formularios del expediente de EJEMPLO: acaba de ver lo que hace
// el producto y es el momento de ofrecer Aproba Despegue. Sin precio en pantalla, por
// decisión de Matthias — el precio va en el presupuesto que él revisa y reenvía. Si
// acepta, rellena el mismo formulario de la landing, prellenado con lo que la sesión ya
// sabe; el fundador recibe el email con la propuesta en PDF adjunta.
const KEY = "aproba.despegue.visto";

export function DespegueModal({ prefill, onClose }: { prefill: PresupuestoPrefill; onClose: () => void }) {
  const t = useT();
  const [paso, setPaso] = useState<"pregunta" | "formulario">("pregunta");
  useEffect(() => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } }, []);
  if (paso === "formulario") return <PresupuestoModal onClose={onClose} prefill={prefill} origen="app-ejemplo" sinPrecio />;
  return <Pregunta onSi={() => setPaso("formulario")} onNo={onClose} />;
}

// ¿Ya se enseñó en este navegador? (una sola vez: insistir sería lo contrario de vender)
export function despegueYaVisto(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function Pregunta({ onSi, onNo }: { onSi: () => void; onNo: () => void }) {
  const t = useT();
  useScrollBloqueado();
  const beneficios = [
    t("Configuración de tu cuenta: servicios, tarifas, cobros y equipo"),
    t("Migración de tus clientes y de los expedientes en curso"),
    t("Formación práctica de tu equipo, sobre tus propios casos"),
    t("Soporte prioritario con un interlocutor dedicado"),
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="despegue-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onNo}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wide text-aproba-700">Aproba Despegue</p>
        <h2 id="despegue-titulo" className="mt-2 text-2xl font-bold tracking-tightest text-slate-900">{t("¿Quieres ir más rápido?")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {t("Acabas de ver lo que hace Aproba con un expediente. Con Aproba Despegue lo tienes funcionando con tus propios clientes en días, no en semanas:")}
        </p>
        <ul className="mt-4 space-y-2.5">
          {beneficios.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onNo} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900">{t("Ahora no")}</button>
          <button type="button" onClick={onSi} className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">{t("Sí, quiero el presupuesto")}</button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">{t("Sin compromiso: te enviamos un presupuesto a medida.")}</p>
      </div>
    </div>
  );
}
