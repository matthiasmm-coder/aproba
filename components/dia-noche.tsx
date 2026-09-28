"use client";

import { useEffect, useRef, useState } from "react";
import { AprobaMark } from "./logo";

// «El día y la noche» animado. 13/09/2026, rehecho el 26/09 (Matthias: «más rápido en
// aparecer y más premium»): antes arrancaba con el 35 % de la rejilla a la vista y la
// columna CON esperaba 1 s (≈ 2,2 s hasta verlo todo); ahora arranca antes, todo está
// visible en 0,6 s y acabado en 1,6 s. Todo en CSS (globals.css, prefijo .dn-).
// Estado FINAL por defecto: sin JS, con reduced-motion o si la sección ya está a la vista
// al montar, nada se esconde (antes, sin JS, las filas se quedaban en opacity 0).
// Solo una sección FUERA de pantalla se «arma» (estado inicial) y se anima al entrar.

type Fase = "final" | "armado" | "on";

function useFase(ref: React.RefObject<HTMLDivElement | null>, umbral: number) {
  const [fase, setFase] = useState<Fase>("final");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dentro = () => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight * 0.92 && r.bottom > 0; };
    if (dentro()) return; // ya a la vista: se queda en el estado final, sin parpadeo
    setFase("armado");
    let hecho = false;
    const encender = () => { if (hecho) return; hecho = true; setFase("on"); io.disconnect(); window.removeEventListener("scroll", porScroll); };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) encender(); }, { threshold: umbral, rootMargin: "0px 0px -5% 0px" });
    // Filete: si el observador no llega (pestaña en segundo plano…), el scroll enciende.
    const porScroll = () => { if (dentro()) encender(); };
    io.observe(el);
    window.addEventListener("scroll", porScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", porScroll); };
  }, [ref, umbral]);
  return fase;
}

export function DiaNoche({ sin, con }: { sin: string[]; con: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const refCon = useRef<HTMLDivElement>(null);
  // La rejilla enciende la columna SIN y la flecha; la tarjeta CON tiene su propio disparo
  // (en móvil queda debajo y se enciende al llegar a ella; en escritorio, a la vez).
  const fase = useFase(ref, 0.15);
  const faseCon = useFase(refCon, 0.2);
  const cls = (f: Fase, pre: string) => (f === "armado" ? `${pre}-a` : f === "on" ? `${pre}-on` : "");

  return (
    <div ref={ref} className={`relative mt-12 grid gap-6 md:grid-cols-2 md:gap-10 ${cls(fase, "dn")}`}>
      {/* Sin Aproba: cada fila sube y se tacha con un trazo que se dibuja */}
      <div className="dn-sin h-full rounded-2xl border border-slate-200 bg-cream-50 p-7">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sin Aproba</h3>
        <ul className="mt-5 space-y-3 text-slate-600">
          {sin.map((s, i) => (
            <li key={s} className="dn-item flex items-start gap-3" style={{ ["--i" as string]: i }}>
              <span className="dn-x mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </span>
              {/* span en línea DENTRO del hijo flex: el tachado (un fondo) sigue las líneas */}
              <span className="min-w-0"><span className="dn-tachar">{s}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {/* Flecha entre las dos columnas (solo escritorio) */}
      <span aria-hidden className="dn-arrow absolute left-1/2 top-1/2 z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-aproba-200 bg-gradient-to-br from-white to-aproba-50 text-aproba-700 shadow-card md:flex">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>

      {/* Con Aproba: cada fila entra, su pastilla se rellena de verde, la marca se dibuja y
          un barrido de luz la recorre; al final la tarjeta se eleva */}
      <div ref={refCon} className={`dn-con dn-con-card h-full rounded-2xl border-2 border-aproba-600 bg-gradient-to-br from-white via-white to-aproba-50/70 p-7 ${cls(faseCon, "dnc")}`}>
        {/* El logo FUERA del uppercase: text-transform alcanza al <text> del SVG y el α
            se volvía «Α» (alfa mayúscula, idéntica a una A). */}
        <h3 className="flex items-center gap-2 text-sm font-semibold text-aproba-700"><AprobaMark size={18} /><span className="uppercase tracking-wide">Con Aproba</span></h3>
        <ul className="mt-5 space-y-3 text-slate-700">
          {con.map((s, i) => (
            <li key={s} className="dn-item relative -mx-2 flex items-start gap-3 overflow-hidden rounded-lg px-2 py-0.5" style={{ ["--i" as string]: i }}>
              <span className="dn-check mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
