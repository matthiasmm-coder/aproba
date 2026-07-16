"use client";

import { useEffect, useState } from "react";

// Sección plegable de la ficha del expediente (plegada por defecto): la cabecera
// muestra un resumen (contador, importe, veredicto) para que la ficha se escanee
// de un vistazo sin abrir nada. El contenido queda SIEMPRE montado (hidden) para
// no perder estados internos (popups de cobro, edición de notas…) ni las anclas.
// El driver «siguiente paso» abre una sección disparando el evento `abrir-seccion`
// con su id (p. ej. Centinela) antes de hacer scroll.
export function SeccionPlegable({ id, titulo, resumen, right, children }: {
  id: string;
  titulo: React.ReactNode;
  resumen?: React.ReactNode; // visible solo plegada
  right?: React.ReactNode; // acción de cabecera (p. ej. enlace Formularios) — siempre visible
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const h = (ev: Event) => { if ((ev as CustomEvent).detail === id) setAbierto(true); };
    window.addEventListener("abrir-seccion", h);
    return () => window.removeEventListener("abrir-seccion", h);
  }, [id]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAbierto((o) => !o)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-5 py-3.5 text-left transition hover:bg-cream-50/60"
        >
          <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          <span className="text-sm font-semibold text-slate-800">{titulo}</span>
          {!abierto && resumen && <span className="min-w-0 truncate text-xs text-slate-400">{resumen}</span>}
        </button>
        {right && <div className="shrink-0 pr-5">{right}</div>}
      </div>
      <div hidden={!abierto} className="border-t border-slate-100 p-4 sm:p-5">{children}</div>
    </section>
  );
}
