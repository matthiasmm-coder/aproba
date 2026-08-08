"use client";

import { useState } from "react";

// Tema del catálogo en el portal del cliente: un desplegable PLEGADO por defecto
// (regla UX de Aproba: todas las listas del portal llegan plegadas). La cabecera
// lleva el nombre del tema y cuántos trámites contiene, para orientarse sin abrir.
//
// El contenido se monta solo al abrir: con muchos temas y muchos servicios, montar
// todas las tarjetas (con sus cálculos de precio) de golpe no aporta nada.

export function TemaPlegable({ titulo, resumen, abiertoInicial = false, children }: {
  titulo: string;
  resumen?: string;
  abiertoInicial?: boolean;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-cream-50/60"
      >
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{titulo}</span>
        {resumen && <span className="shrink-0 text-xs text-slate-400">{resumen}</span>}
      </button>
      {abierto && <div className="space-y-2 border-t border-slate-100 p-3">{children}</div>}
    </section>
  );
}
